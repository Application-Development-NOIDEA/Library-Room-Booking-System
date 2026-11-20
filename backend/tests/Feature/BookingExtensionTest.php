<?php

use App\Models\Booking;
use App\Models\BookingExtension;
use App\Models\Room;
use App\Models\User;
use App\Models\WaitingList;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

/*
 | Clock: Monday 16 Nov 2026, 11:50 in Malaysia (= 03:50 UTC),
 | so a booking ending at 12:00 is in its last 15 minutes.
 */
beforeEach(function () {
    extAt('11:50');

    Room::insert([
        ['room_code' => 'DISC-01', 'room_name' => 'Discussion Room 1', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
        ['room_code' => 'DISC-02', 'room_name' => 'Discussion Room 2', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
    ]);
});

afterEach(fn () => Carbon::setTestNow());

/** Set the clock to a Malaysian time on 16 Nov 2026. */
function extAt(string $time): void
{
    Carbon::setTestNow(Carbon::parse("2026-11-16 $time", 'Asia/Kuala_Lumpur')->utc());
}

function extStudent(string $name): User
{
    $user = User::create(['name' => $name, 'email' => strtolower($name).'@graduate.utm.my', 'password' => 'Password123']);
    $user->role = 'student';
    $user->save();

    return $user;
}

/** A booking at Malaysian times, in Discussion Room 1 unless another code is given. */
function extBooking(User $user, string $start, string $end, string $status = 'confirmed', string $room = 'DISC-01'): Booking
{
    return Booking::create([
        'user_id' => $user->id,
        'room_id' => Room::where('room_code', $room)->value('id'),
        'start_at' => Carbon::parse("2026-11-16 $start", 'Asia/Kuala_Lumpur')->utc(),
        'end_at' => Carbon::parse("2026-11-16 $end", 'Asia/Kuala_Lumpur')->utc(),
        'status' => $status,
    ]);
}

function extRequest(Booking $booking, int $hours = 1)
{
    return test()->postJson("/api/bookings/{$booking->id}/extend", ['hours' => $hours]);
}

test('guests cannot request an extension', function () {
    $booking = extBooking(extStudent('Aina'), '10:00', '12:00');
    extRequest($booking)->assertUnauthorized();
});

test('a free room is extended straight away', function () {
    $aina = extStudent('Aina');
    $booking = extBooking($aina, '10:00', '12:00', 'checked_in');
    Sanctum::actingAs($aina);

    extRequest($booking, 2)->assertOk()
        ->assertJsonPath('extension.status', 'approved')
        ->assertJsonPath('booking.end_time', '14:00')
        ->assertJsonPath('message', 'Extended! Your booking now ends at 2:00 PM.');

    expect($booking->fresh()->end_at->copy()->setTimezone('Asia/Kuala_Lumpur')->format('H:i'))->toBe('14:00');
    expect(BookingExtension::where('status', 'approved')->count())->toBe(1);
});

test('it is refused when someone has booked the next slot', function () {
    $aina = extStudent('Aina');
    $booking = extBooking($aina, '10:00', '12:00');
    extBooking(extStudent('Ben'), '12:00', '13:00');
    Sanctum::actingAs($aina);

    extRequest($booking)->assertStatus(409)
        ->assertJsonPath('extension.status', 'rejected')
        ->assertJsonPath('message', "Someone has booked Discussion Room 1 from 12:00 PM, so it can't be extended.");

    expect($booking->fresh()->end_at->copy()->setTimezone('Asia/Kuala_Lumpur')->format('H:i'))->toBe('12:00');
    expect(BookingExtension::where('status', 'rejected')->count())->toBe(1);
});

test('students on the waiting list for that time come first', function () {
    $aina = extStudent('Aina');
    $booking = extBooking($aina, '10:00', '12:00');
    WaitingList::create([
        'user_id' => extStudent('Ben')->id,
        'room_type' => 'discussion',
        'wanted_start' => Carbon::parse('2026-11-16 12:00', 'Asia/Kuala_Lumpur')->utc(),
        'wanted_end' => Carbon::parse('2026-11-16 13:00', 'Asia/Kuala_Lumpur')->utc(),
        'party_size' => 1,
        'joined_at' => now(),
        'status' => 'waiting',
    ]);
    Sanctum::actingAs($aina);

    extRequest($booking)->assertStatus(409)
        ->assertJsonPath('message', 'Other students are on the waiting list for this time, so the room goes to them first.');
});

test('you can only ask in the last 15 minutes of the booking', function () {
    $aina = extStudent('Aina');
    $booking = extBooking($aina, '10:00', '12:00');
    Sanctum::actingAs($aina);

    extAt('11:30');
    extRequest($booking)->assertStatus(422)
        ->assertJsonPath('message', 'You can request an extension in the last 15 minutes of your booking (from 11:45 AM).');

    extAt('11:45');
    extRequest($booking)->assertOk()->assertJsonPath('booking.end_time', '13:00');
});

test('a booking cannot go past closing time', function () {
    $aina = extStudent('Aina');
    $booking = extBooking($aina, '20:00', '22:00');
    Sanctum::actingAs($aina);
    extAt('21:50');

    extRequest($booking)->assertStatus(422)
        ->assertJsonPath('message', 'The library closes at 10:00 PM, so this booking can only be extended until then.');
    extRequest($booking, 3)->assertStatus(422)->assertJsonPath('message', 'You can extend by 1 or 2 hours.');
});

test('only your own active bookings can be extended', function () {
    $aina = extStudent('Aina');
    $bens = extBooking(extStudent('Ben'), '10:00', '12:00', 'confirmed', 'DISC-02');
    $cancelled = extBooking($aina, '13:00', '14:00', 'cancelled');
    $ended = extBooking($aina, '08:00', '10:00', 'confirmed');
    Sanctum::actingAs($aina);

    extRequest($bens)->assertForbidden();
    extRequest($cancelled)->assertStatus(422)->assertJsonPath('message', 'Only confirmed or checked-in bookings can be extended.');
    extRequest($ended)->assertStatus(422)->assertJsonPath('message', 'This booking has already ended.');
});

test('my bookings says which bookings can be extended, and from when', function () {
    $aina = extStudent('Aina');
    extBooking($aina, '10:00', '12:00');                        // in its last 15 minutes
    extBooking($aina, '13:00', '14:00', 'confirmed', 'DISC-02'); // later today
    extBooking($aina, '20:00', '22:00');                        // ends at closing time
    Sanctum::actingAs($aina);

    $bookings = collect(test()->getJson('/api/bookings/mine')->assertOk()->json('bookings'))->keyBy('end_time');

    expect($bookings['12:00']['can_extend'])->toBeTrue();
    expect($bookings['14:00']['can_extend'])->toBeFalse();
    expect($bookings['14:00']['extend_from'])->toBe('13:45');
    expect($bookings['22:00']['can_extend'])->toBeFalse();
    expect($bookings['22:00']['extend_from'])->toBeNull();
});