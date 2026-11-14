<?php

use App\Models\Booking;
use App\Models\Room;
use App\Models\User;
use App\Models\UserNotification;
use App\Models\WaitingList;
use App\Models\WaitingListOffer;
use App\Services\WaitingListService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

/*
 | Clock: Monday 16 Nov 2026, 07:00 in Malaysia (= Sunday 15 Nov, 23:00 UTC).
 | Two discussion rooms, so a slot is full once both are booked.
 */
beforeEach(function () {
    Carbon::setTestNow(Carbon::create(2026, 11, 15, 23, 0, 0, 'UTC'));

    Room::insert([
        ['room_code' => 'DISC-01', 'room_name' => 'Discussion Room 1', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
        ['room_code' => 'DISC-02', 'room_name' => 'Discussion Room 2', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
    ]);
});

afterEach(fn () => Carbon::setTestNow());

/** A Malaysian time, converted to UTC the way the database stores it. */
function wlAt(string $time): Carbon
{
    return Carbon::parse($time, 'Asia/Kuala_Lumpur')->utc();
}

function wlStudent(string $name): User
{
    $user = User::create([
        'name' => $name,
        'email' => strtolower(str_replace(' ', '.', $name)).'@graduate.utm.my',
        'password' => 'Password123',
    ]);
    $user->role = 'student';
    $user->save();

    return $user;
}

function wlBooking(User $user, string $roomCode, string $start, string $end, string $status = 'confirmed'): Booking
{
    return Booking::create([
        'user_id' => $user->id,
        'room_id' => Room::where('room_code', $roomCode)->value('id'),
        'start_at' => wlAt($start),
        'end_at' => wlAt($end),
        'status' => $status,
    ]);
}

/** Both discussion rooms booked 10:00-12:00. Returns the two bookings. */
function wlFillTenToTwelve(): array
{
    return [
        wlBooking(wlStudent('Owner One'), 'DISC-01', '2026-11-16 10:00', '2026-11-16 12:00'),
        wlBooking(wlStudent('Owner Two'), 'DISC-02', '2026-11-16 10:00', '2026-11-16 12:00'),
    ];
}

function wlJoin(array $overrides = [])
{
    return test()->postJson('/api/waiting-list', array_merge([
        'room_type' => 'discussion',
        'date' => '2026-11-16',
        'start_time' => '10:00',
        'duration' => 2,
    ], $overrides));
}

test('guests cannot join the waiting list', function () {
    wlJoin()->assertUnauthorized();
});

test('you cannot queue for a future slot that still has a free room', function () {
    Sanctum::actingAs(wlStudent('Aina'));

    wlJoin()->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'still free'));
    expect(WaitingList::count())->toBe(0);
});

test('students join a full slot in order and see their position', function () {
    wlFillTenToTwelve();
    $aina = wlStudent('Aina');
    $ben = wlStudent('Ben');

    Sanctum::actingAs($aina);
    wlJoin()->assertCreated()
        ->assertJsonPath('entry.status', 'waiting')
        ->assertJsonPath('entry.position', 1)
        ->assertJsonPath('entry.start_time', '10:00')
        ->assertJsonPath('entry.end_time', '12:00');

    Carbon::setTestNow(now()->addMinute());
    Sanctum::actingAs($ben);
    wlJoin()->assertCreated()
        ->assertJsonPath('entry.position', 2)
        ->assertJsonPath('entry.line_size', 2);

    // Stored in UTC: 10:00 Malaysia = 02:00 UTC
    expect(WaitingList::first()->wanted_start->utc()->format('H:i'))->toBe('02:00');
});

test('you cannot join the same slot twice, or more than three queues', function () {
    wlFillTenToTwelve();
    foreach (['13', '15', '17'] as $hour) {
        $end = sprintf('%02d', $hour + 1);
        wlBooking(wlStudent("A$hour"), 'DISC-01', "2026-11-16 $hour:00", "2026-11-16 $end:00");
        wlBooking(wlStudent("B$hour"), 'DISC-02', "2026-11-16 $hour:00", "2026-11-16 $end:00");
    }

    Sanctum::actingAs(wlStudent('Aina'));

    wlJoin()->assertCreated();
    wlJoin()->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'already on the waiting list'));

    wlJoin(['start_time' => '13:00', 'duration' => 1])->assertCreated();
    wlJoin(['start_time' => '15:00', 'duration' => 1])->assertCreated();
    wlJoin(['start_time' => '17:00', 'duration' => 1])
        ->assertStatus(422)
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'at most 3'));
});

test('a cancelled booking is offered to the first student in the queue', function () {
    [$first] = wlFillTenToTwelve();
    $aina = wlStudent('Aina');
    $ben = wlStudent('Ben');

    Sanctum::actingAs($aina);
    wlJoin()->assertCreated();
    Carbon::setTestNow(now()->addMinute());
    Sanctum::actingAs($ben);
    wlJoin()->assertCreated();

    Sanctum::actingAs($first->user);
    test()->postJson("/api/bookings/{$first->id}/cancel")->assertOk();

    $ainaEntry = WaitingList::where('user_id', $aina->id)->first();
    $benEntry = WaitingList::where('user_id', $ben->id)->first();

    expect($ainaEntry->status)->toBe('offered');
    expect($benEntry->status)->toBe('waiting');

    $offer = WaitingListOffer::first();
    expect($offer->status)->toBe('pending');
    expect($offer->booking->status)->toBe('held');
    expect($offer->booking->room->room_name)->toBe('Discussion Room 1');
    expect(abs($offer->expires_at->diffInMinutes(now())))->toEqual(10);

    expect(UserNotification::where('user_id', $aina->id)->where('message_type', 'waiting_list_offer')->exists())->toBeTrue();

    Sanctum::actingAs($aina);
    test()->getJson('/api/waiting-list/mine')->assertOk()
        ->assertJsonPath('entries.0.status', 'offered')
        ->assertJsonPath('entries.0.offer.room_name', 'Discussion Room 1')
        ->assertJsonPath('entries.0.offer.start_time', '10:00');
});

test('accepting the offer confirms the booking', function () {
    [$first] = wlFillTenToTwelve();
    $aina = wlStudent('Aina');

    Sanctum::actingAs($aina);
    $entryId = wlJoin()->json('entry.id');

    Sanctum::actingAs($first->user);
    test()->postJson("/api/bookings/{$first->id}/cancel")->assertOk();

    Carbon::setTestNow(now()->addMinutes(5));
    Sanctum::actingAs($aina);
    test()->postJson("/api/waiting-list/{$entryId}/accept")->assertOk()
        ->assertJsonPath('entry.status', 'fulfilled')
        ->assertJsonPath('booking.status', 'confirmed')
        ->assertJsonPath('booking.room_name', 'Discussion Room 1')
        ->assertJsonPath('entry.booking.room_name', 'Discussion Room 1');

    expect(WaitingListOffer::first()->status)->toBe('accepted');
    expect(Booking::where('user_id', $aina->id)->first()->status)->toBe('confirmed');
});

test('an offer not accepted within 10 minutes goes to the next student', function () {
    [$first] = wlFillTenToTwelve();
    $aina = wlStudent('Aina');
    $ben = wlStudent('Ben');

    Sanctum::actingAs($aina);
    $ainaEntryId = wlJoin()->json('entry.id');
    Carbon::setTestNow(now()->addMinute());
    Sanctum::actingAs($ben);
    wlJoin();

    Sanctum::actingAs($first->user);
    test()->postJson("/api/bookings/{$first->id}/cancel")->assertOk();

    Carbon::setTestNow(now()->addMinutes(11));
    app(WaitingListService::class)->process();

    expect(WaitingList::find($ainaEntryId)->status)->toBe('expired');
    expect(WaitingList::where('user_id', $ben->id)->first()->status)->toBe('offered');
    expect(Booking::where('user_id', $aina->id)->first()->status)->toBe('cancelled');
    expect(Booking::where('user_id', $ben->id)->first()->status)->toBe('held');

    Sanctum::actingAs($aina);
    test()->postJson("/api/waiting-list/{$ainaEntryId}/accept")->assertStatus(409);
});

test('declining an offer passes the room to the next student', function () {
    [$first] = wlFillTenToTwelve();
    $aina = wlStudent('Aina');
    $ben = wlStudent('Ben');

    Sanctum::actingAs($aina);
    $ainaEntryId = wlJoin()->json('entry.id');
    Carbon::setTestNow(now()->addMinute());
    Sanctum::actingAs($ben);
    wlJoin();

    Sanctum::actingAs($first->user);
    test()->postJson("/api/bookings/{$first->id}/cancel")->assertOk();

    Sanctum::actingAs($aina);
    test()->postJson("/api/waiting-list/{$ainaEntryId}/leave")->assertOk()
        ->assertJsonPath('entry.status', 'cancelled');

    expect(WaitingListOffer::where('status', 'declined')->count())->toBe(1);
    expect(WaitingList::where('user_id', $ben->id)->first()->status)->toBe('offered');
});

test('a booking with no check-in after 15 minutes becomes a no-show and goes to the queue', function () {
    $noShow = wlBooking(wlStudent('Late One'), 'DISC-01', '2026-11-16 08:00', '2026-11-16 10:00');
    wlBooking(wlStudent('On Time'), 'DISC-02', '2026-11-16 08:00', '2026-11-16 10:00', 'checked_in');

    $aina = wlStudent('Aina');
    $entry = WaitingList::create([
        'user_id' => $aina->id,
        'room_type' => 'discussion',
        'wanted_start' => wlAt('2026-11-16 08:00'),
        'wanted_end' => wlAt('2026-11-16 10:00'),
        'party_size' => 1,
        'joined_at' => now(),
        'status' => 'waiting',
    ]);

    Carbon::setTestNow(wlAt('2026-11-16 08:10'));
    app(WaitingListService::class)->process();
    expect($noShow->fresh()->status)->toBe('confirmed');

    Carbon::setTestNow(wlAt('2026-11-16 08:16'));
    $result = app(WaitingListService::class)->process();

    expect($result['no_shows'])->toBe(1);
    expect($noShow->fresh()->status)->toBe('no_show');
    expect($entry->fresh()->status)->toBe('offered');

    $held = Booking::where('user_id', $aina->id)->first();
    expect($held->start_at->copy()->setTimezone('Asia/Kuala_Lumpur')->format('H:i'))->toBe('08:16');
    expect(UserNotification::where('message_type', 'booking_no_show')->count())->toBe(1);
});

test('you can only see and change your own requests', function () {
    wlFillTenToTwelve();
    $aina = wlStudent('Aina');
    $ben = wlStudent('Ben');

    Sanctum::actingAs($aina);
    $entryId = wlJoin()->json('entry.id');

    Sanctum::actingAs($ben);
    test()->getJson('/api/waiting-list/mine')->assertOk()->assertJsonCount(0, 'entries');
    test()->postJson("/api/waiting-list/{$entryId}/leave")->assertForbidden();
    test()->postJson("/api/waiting-list/{$entryId}/accept")->assertForbidden();

    Sanctum::actingAs($aina);
    test()->getJson('/api/waiting-list/mine')->assertOk()
        ->assertJsonCount(1, 'entries')
        ->assertJsonPath('entries.0.position', 1)
        ->assertJsonPath('rules.offer_minutes', 10);
});