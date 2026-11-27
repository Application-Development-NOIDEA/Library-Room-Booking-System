<?php

use App\Models\Booking;
use App\Models\BookingCheckin;
use App\Models\Room;
use App\Models\User;
use App\Services\WaitingListService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    // 10:00 in Kuala Lumpur
    Carbon::setTestNow(Carbon::create(2026, 11, 16, 2, 0, 0, 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

function qrUser(string $role): User
{
    $user = User::create(['name' => ucfirst($role).' '.uniqid(), 'email' => uniqid($role).'@utm.my', 'password' => 'Password123']);
    $user->role = $role;
    $user->save();

    return $user;
}

function qrBooking(User $student, int $startMin, int $endMin, string $status = 'confirmed'): Booking
{
    $room = Room::create([
        'room_code' => 'DISC-'.uniqid(), 'room_name' => 'Discussion Room 1', 'room_type' => 'discussion',
        'capacity' => 6, 'status' => 'active',
    ]);

    return Booking::create([
        'user_id' => $student->id,
        'room_id' => $room->id,
        'start_at' => now()->addMinutes($startMin),
        'end_at' => now()->addMinutes($endMin),
        'status' => $status,
    ]);
}

/** Student asks for their QR and gets the raw token back. */
function qrToken(User $student, Booking $booking): string
{
    Sanctum::actingAs($student);

    return test()->postJson("/api/bookings/{$booking->id}/qr")->assertOk()->json('qr_token');
}

test('a student gets a real, unguessable QR token and only its hash is stored', function () {
    $student = qrUser('student');
    $booking = qrBooking($student, 5, 125);

    Sanctum::actingAs($student);
    $response = test()->postJson("/api/bookings/{$booking->id}/qr")
        ->assertOk()
        ->assertJsonPath('status', 'confirmed')
        ->assertJsonPath('qr_state', 'check_in')
        ->assertHeader('Cache-Control', 'no-store, private');

    $token = $response->json('qr_token');
    expect($token)->toMatch('/^[a-f0-9]{64}$/');
    expect($booking->fresh()->qr_token_hash)->toBe(hash('sha256', $token));
    expect($response->json('check_in_deadline'))->toContain('10:20'); // start 10:05 + 15 min
});

test('a student cannot get or watch the QR of someone else\'s booking', function () {
    $booking = qrBooking(qrUser('student'), 5, 125);
    Sanctum::actingAs(qrUser('student'));

    test()->postJson("/api/bookings/{$booking->id}/qr")->assertNotFound();
    test()->getJson("/api/bookings/{$booking->id}/qr/status")->assertNotFound();
});

test('scanning the QR checks the student in, then scanning again checks them out', function () {
    $student = qrUser('student');
    $booking = qrBooking($student, -5, 115);
    $token = qrToken($student, $booking);

    $staff = qrUser('staff');
    Sanctum::actingAs($staff);

    test()->postJson('/api/staff/bookings/scan', ['query' => $token])
        ->assertOk()
        ->assertJsonPath('result', 'checked_in')
        ->assertJsonPath('booking.status', 'checked_in')
        ->assertJsonPath('booking.qr_state', 'check_out');

    expect(BookingCheckin::where('booking_id', $booking->id)->first()->checked_in_by)->toBe($staff->id);

    // The student's screen picks the change up
    Sanctum::actingAs($student);
    test()->getJson("/api/bookings/{$booking->id}/qr/status")
        ->assertOk()
        ->assertJsonPath('status', 'checked_in')
        ->assertJsonPath('qr_state', 'check_out');
    expect(test()->getJson("/api/bookings/{$booking->id}/qr/status")->json('checked_in_at'))->not->toBeNull();

    Carbon::setTestNow(now()->addMinutes(90));
    Sanctum::actingAs($staff);
    test()->postJson('/api/staff/bookings/scan', ['query' => strtoupper($token)])
        ->assertOk()
        ->assertJsonPath('result', 'checked_out')
        ->assertJsonPath('booking.status', 'checked_out');

    // Finished: the token is wiped and the same QR no longer works
    expect($booking->fresh()->qr_token_hash)->toBeNull();
    test()->postJson('/api/staff/bookings/scan', ['query' => $token])
        ->assertNotFound()->assertJsonPath('result', 'invalid');

    Sanctum::actingAs($student);
    test()->getJson("/api/bookings/{$booking->id}/qr/status")
        ->assertJsonPath('status', 'checked_out')
        ->assertJsonPath('qr_state', 'used');
    test()->postJson("/api/bookings/{$booking->id}/qr")->assertStatus(422);
});

test('a QR scanned too early is refused and nothing changes', function () {
    $student = qrUser('student');
    $booking = qrBooking($student, 60, 180);
    $token = qrToken($student, $booking);

    Sanctum::actingAs(qrUser('staff'));
    test()->postJson('/api/staff/bookings/scan', ['query' => $token])
        ->assertStatus(422)
        ->assertJsonPath('result', 'not_yet_open');

    expect($booking->fresh()->status)->toBe('confirmed');
});

test('opening the QR again replaces the old code', function () {
    $student = qrUser('student');
    $booking = qrBooking($student, -5, 115);
    $old = qrToken($student, $booking);
    $new = qrToken($student, $booking);

    Sanctum::actingAs(qrUser('staff'));
    test()->postJson('/api/staff/bookings/scan', ['query' => $old])->assertNotFound();
    test()->postJson('/api/staff/bookings/scan', ['query' => $new])->assertOk();
});

test('a student who does not come: the QR expires and the booking is cancelled as a no-show', function () {
    $student = qrUser('student');
    $booking = qrBooking($student, 0, 120); // starts 10:00
    $token = qrToken($student, $booking);

    // 10:16: past the 15-minute grace window, before the scheduler has run
    Carbon::setTestNow(now()->addMinutes(WaitingListService::CHECK_IN_GRACE_MINUTES + 1));

    Sanctum::actingAs(qrUser('staff'));
    test()->postJson('/api/staff/bookings/scan', ['query' => $token])
        ->assertStatus(422)
        ->assertJsonPath('result', 'expired');

    Sanctum::actingAs($student);
    test()->getJson("/api/bookings/{$booking->id}/qr/status")->assertJsonPath('qr_state', 'expired');
    test()->postJson("/api/bookings/{$booking->id}/qr")->assertStatus(422);

    // The every-minute scheduler job releases it
    test()->artisan('waiting-list:process')->assertSuccessful();

    $booking->refresh();
    expect($booking->status)->toBe('no_show');
    expect($booking->qr_token_hash)->toBeNull();

    test()->getJson('/api/bookings/mine')->assertOk()
        ->assertJsonPath('bookings.0.status', 'no_show')
        ->assertJsonPath('bookings.0.tab', 'cancelled');

    Sanctum::actingAs(qrUser('staff'));
    test()->postJson('/api/staff/bookings/scan', ['query' => $token])->assertNotFound();
});

test('cancelling a booking wipes its QR', function () {
    $student = qrUser('student');
    $booking = qrBooking($student, 120, 240);
    qrToken($student, $booking);

    test()->postJson("/api/bookings/{$booking->id}/cancel")->assertOk();
    expect($booking->fresh()->qr_token_hash)->toBeNull();
});

test('only staff can scan', function () {
    Sanctum::actingAs(qrUser('student'));
    test()->postJson('/api/staff/bookings/scan', ['query' => str_repeat('a', 64)])->assertForbidden();
});