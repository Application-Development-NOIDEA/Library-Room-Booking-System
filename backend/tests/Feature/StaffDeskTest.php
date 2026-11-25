<?php

use App\Models\Booking;
use App\Models\BookingCheckin;
use App\Models\BookingExtension;
use App\Models\IssueReport;
use App\Models\Room;
use App\Models\User;
use App\Models\WaitingList;
use App\Models\IssueReportAnalysis;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    // 10:00 in Kuala Lumpur
    Carbon::setTestNow(Carbon::create(2026, 11, 16, 2, 0, 0, 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

function sdUser(string $role, ?string $matric = null): User
{
    $user = User::create(['name' => ucfirst($role), 'email' => uniqid($role).'@utm.my', 'password' => 'Password123']);
    $user->role = $role;
    $user->student_id = $matric;
    $user->save();

    return $user;
}

function sdRoom(string $code = 'DISC-01', string $status = 'active'): Room
{
    return Room::create([
        'room_code' => $code, 'room_name' => "Room {$code}", 'room_type' => 'discussion',
        'capacity' => 6, 'status' => $status,
    ]);
}

/** Booking that starts $startMin minutes from "now" and ends $endMin minutes from "now". */
function sdBooking(Room $room, User $student, int $startMin, int $endMin, string $status = 'confirmed'): Booking
{
    return Booking::create([
        'user_id' => $student->id,
        'room_id' => $room->id,
        'start_at' => now()->addMinutes($startMin),
        'end_at' => now()->addMinutes($endMin),
        'status' => $status,
    ]);
}

test('only staff can use the front desk', function () {
    $student = sdUser('student');
    $booking = sdBooking(sdRoom(), $student, -5, 115);

    test()->getJson('/api/staff/dashboard')->assertUnauthorized();
    test()->postJson("/api/staff/bookings/{$booking->id}/check-in")->assertUnauthorized();

    Sanctum::actingAs($student);
    test()->getJson('/api/staff/dashboard')->assertForbidden();
    test()->postJson("/api/staff/bookings/{$booking->id}/check-in")->assertForbidden();

    expect($booking->fresh()->status)->toBe('confirmed');
});

test('the dashboard lists rooms, bookings, waiting list, extensions and reports', function () {
    $room = sdRoom();
    $student = sdUser('student', 'A22EC0001');
    $booking = sdBooking($room, $student, 30, 150);

    WaitingList::create([
        'user_id' => $student->id, 'room_type' => 'discussion',
        'wanted_start' => now()->addHour(), 'wanted_end' => now()->addHours(3),
        'party_size' => 2, 'joined_at' => now(), 'status' => 'waiting',
    ]);
    BookingExtension::create([
        'booking_id' => $booking->id, 'requested_end_at' => now()->addMinutes(210),
        'status' => 'pending', 'requested_at' => now(),
    ]);
    IssueReport::create([
        'booking_id' => $booking->id, 'user_id' => $student->id, 'room_id' => $room->id,
        'issue_category' => 'lighting', 'description' => 'Light flickers.', 'status' => 'submitted',
    ]);

    Sanctum::actingAs(sdUser('staff'));

    test()->getJson('/api/staff/dashboard')->assertOk()
        ->assertJsonCount(1, 'rooms')
        ->assertJsonCount(1, 'bookings')
        ->assertJsonCount(1, 'waitlist')
        ->assertJsonCount(1, 'extensions')
        ->assertJsonCount(1, 'reports')
        ->assertJsonPath('bookings.0.reference', $booking->reference)
        ->assertJsonPath('bookings.0.matric', 'A22EC0001')
        ->assertJsonPath('rooms.0.code', 'DISC-01')
        ->assertJsonPath('reports.0.room', 'DISC-01');
});

test('staff can find a booking by reference or by the student QR code', function () {
    $booking = sdBooking(sdRoom(), sdUser('student', 'A22EC0001'), 30, 150);
    $token = bin2hex(random_bytes(32));
    $booking->qr_token_hash = hash('sha256', $token);
    $booking->save();

    Sanctum::actingAs(sdUser('staff'));

    test()->postJson('/api/staff/bookings/lookup', ['query' => strtolower($booking->reference)])
        ->assertOk()->assertJsonPath('booking.id', $booking->id);
    test()->postJson('/api/staff/bookings/lookup', ['query' => $token])
        ->assertOk()->assertJsonPath('booking.id', $booking->id);
    test()->postJson('/api/staff/bookings/lookup', ['query' => 'BK-9999'])->assertNotFound();
    test()->postJson('/api/staff/bookings/lookup', ['query' => str_repeat('a', 64)])->assertNotFound();
});

test('staff can check a student in and out, and it is recorded', function () {
    $booking = sdBooking(sdRoom(), sdUser('student'), -5, 115);
    $staff = sdUser('staff');
    Sanctum::actingAs($staff);

    test()->postJson("/api/staff/bookings/{$booking->id}/check-in")
        ->assertOk()->assertJsonPath('booking.status', 'checked_in');

    $checkin = BookingCheckin::where('booking_id', $booking->id)->first();
    expect($checkin->checked_in_by)->toBe($staff->id);
    expect($checkin->checked_in_at)->not->toBeNull();

    test()->postJson("/api/staff/bookings/{$booking->id}/check-out")
        ->assertOk()->assertJsonPath('booking.status', 'checked_out');

    expect($checkin->fresh()->checked_out_by)->toBe($staff->id);
    expect($checkin->fresh()->checked_out_at)->not->toBeNull();
});

test('check-in is refused when it should not be allowed', function () {
    $room = sdRoom();
    $student = sdUser('student');
    $early = sdBooking($room, $student, 30, 150);                       // opens 15 minutes before start
    $ended = sdBooking($room, $student, -200, -80);
    $released = sdBooking($room, $student, -20, 100, 'no_show');
    $done = sdBooking($room, $student, -60, 60, 'checked_out');
    $ok = sdBooking($room, $student, 10, 130);                          // within 15 minutes of start

    Sanctum::actingAs(sdUser('staff'));

    foreach ([$early, $ended, $released, $done] as $booking) {
        test()->postJson("/api/staff/bookings/{$booking->id}/check-in")->assertStatus(422);
    }
    expect($early->fresh()->status)->toBe('confirmed');
    expect($released->fresh()->status)->toBe('no_show');

    test()->postJson("/api/staff/bookings/{$ok->id}/check-in")->assertOk();
    test()->postJson("/api/staff/bookings/{$ok->id}/check-in")->assertStatus(422); // not twice
    expect(BookingCheckin::count())->toBe(1);
});

test('check-out only works for students who are checked in', function () {
    $booking = sdBooking(sdRoom(), sdUser('student'), -5, 115);
    Sanctum::actingAs(sdUser('staff'));

    test()->postJson("/api/staff/bookings/{$booking->id}/check-out")->assertStatus(422);
    expect($booking->fresh()->status)->toBe('confirmed');
});

test('a no-show can only be marked after the booking has started', function () {
    $room = sdRoom();
    $student = sdUser('student');
    $future = sdBooking($room, $student, 10, 130);
    $started = sdBooking($room, $student, -5, 115);
    Sanctum::actingAs(sdUser('staff'));

    test()->postJson("/api/staff/bookings/{$future->id}/no-show")->assertStatus(422);
    test()->postJson("/api/staff/bookings/{$started->id}/no-show")
        ->assertOk()->assertJsonPath('booking.status', 'no_show');
});

test('a walk-in is created, and checked in when it starts now', function () {
    $room = sdRoom();
    sdUser('student', 'A22EC0001');
    Sanctum::actingAs(sdUser('staff'));

    // Now is 10:00 in Kuala Lumpur
    test()->postJson('/api/staff/walk-ins', [
        'matric' => 'A22EC0001', 'room_id' => $room->id, 'start' => '10:00', 'end' => '12:00',
    ])->assertCreated()->assertJsonPath('booking.status', 'checked_in');

    expect(BookingCheckin::count())->toBe(1);

    // Same room, overlapping time
    test()->postJson('/api/staff/walk-ins', [
        'matric' => 'A22EC0001', 'room_id' => $room->id, 'start' => '11:00', 'end' => '13:00',
    ])->assertStatus(422);

    // Later today: booked, not checked in yet
    test()->postJson('/api/staff/walk-ins', [
        'matric' => 'A22EC0001', 'room_id' => $room->id, 'start' => '13:00', 'end' => '14:00',
    ])->assertCreated()->assertJsonPath('booking.status', 'confirmed');
});

test('a walk-in is refused for bad input', function () {
    $room = sdRoom();
    $closed = sdRoom('DISC-02', 'maintenance');
    sdUser('student', 'A22EC0001');
    Sanctum::actingAs(sdUser('staff'));

    $base = ['matric' => 'A22EC0001', 'room_id' => $room->id, 'start' => '10:00', 'end' => '12:00'];

    test()->postJson('/api/staff/walk-ins', array_merge($base, ['matric' => 'NOBODY']))->assertStatus(422);
    test()->postJson('/api/staff/walk-ins', array_merge($base, ['room_id' => $closed->id]))->assertStatus(422);
    test()->postJson('/api/staff/walk-ins', array_merge($base, ['end' => '09:00']))->assertStatus(422);
    test()->postJson('/api/staff/walk-ins', array_merge($base, ['end' => '15:00']))->assertStatus(422); // over 4 hours

    expect(Booking::count())->toBe(0);
});

test('staff can put a room into maintenance and see how many bookings are affected', function () {
    $room = sdRoom();
    sdBooking($room, sdUser('student'), 60, 180);
    Sanctum::actingAs(sdUser('staff'));

    test()->patchJson("/api/staff/rooms/{$room->id}/status", ['status' => 'maintenance'])
        ->assertOk()->assertJsonPath('affected_bookings', 1);
    expect($room->fresh()->status)->toBe('maintenance');

    test()->patchJson("/api/staff/rooms/{$room->id}/status", ['status' => 'active'])
        ->assertOk()->assertJsonPath('affected_bookings', 0);
    test()->patchJson("/api/staff/rooms/{$room->id}/status", ['status' => 'broken'])->assertStatus(422);
});

test('an extension can be approved, rejected, and only decided once', function () {
    $room = sdRoom();
    $booking = sdBooking($room, sdUser('student'), -30, 90);
    $approve = BookingExtension::create(['booking_id' => $booking->id, 'requested_end_at' => now()->addMinutes(150), 'status' => 'pending', 'requested_at' => now()]);
    $reject = BookingExtension::create(['booking_id' => $booking->id, 'requested_end_at' => now()->addMinutes(200), 'status' => 'pending', 'requested_at' => now()]);
    Sanctum::actingAs(sdUser('staff'));

    test()->patchJson("/api/staff/extensions/{$approve->id}/decision", ['decision' => 'approved'])->assertOk();
    expect($booking->fresh()->end_at->equalTo(now()->addMinutes(150)))->toBeTrue();

    test()->patchJson("/api/staff/extensions/{$approve->id}/decision", ['decision' => 'rejected'])->assertStatus(409);

    test()->patchJson("/api/staff/extensions/{$reject->id}/decision", ['decision' => 'rejected'])->assertOk();
    expect($reject->fresh()->status)->toBe('rejected');
});

test('an extension cannot be approved when another booking needs the room', function () {
    $room = sdRoom();
    $student = sdUser('student');
    $booking = sdBooking($room, $student, -30, 90);
    sdBooking($room, sdUser('student'), 90, 210);   // starts right when the first one ends
    $extension = BookingExtension::create(['booking_id' => $booking->id, 'requested_end_at' => now()->addMinutes(150), 'status' => 'pending', 'requested_at' => now()]);
    Sanctum::actingAs(sdUser('staff'));

    test()->patchJson("/api/staff/extensions/{$extension->id}/decision", ['decision' => 'approved'])->assertStatus(422);

    expect($extension->fresh()->status)->toBe('pending');
    expect($booking->fresh()->end_at->equalTo(now()->addMinutes(90)))->toBeTrue();
});

test('staff can change the status of an issue report', function () {
    $room = sdRoom();
    $student = sdUser('student');
    $booking = sdBooking($room, $student, -200, -80, 'checked_out');
    $report = IssueReport::create([
        'booking_id' => $booking->id, 'user_id' => $student->id, 'room_id' => $room->id,
        'issue_category' => 'lighting', 'description' => 'Light flickers.', 'status' => 'submitted',
    ]);
    Sanctum::actingAs(sdUser('staff'));

    test()->patchJson("/api/staff/reports/{$report->id}/status", ['status' => 'in_progress'])->assertOk();
    expect($report->fresh()->status)->toBe('in_progress');

    test()->patchJson("/api/staff/reports/{$report->id}/status", ['status' => 'banana'])->assertStatus(422);
});

test('staff can run the waiting-list check from the desk', function () {
    Sanctum::actingAs(sdUser('staff'));

    test()->postJson('/api/staff/waitlist/process')->assertOk()
        ->assertJsonStructure(['result' => ['no_shows', 'expired_offers', 'expired_requests', 'offers']]);
});

test('the dashboard shows the AI result for each report', function () {
    $room = sdRoom();
    $student = sdUser('student');
    $booking = sdBooking($room, $student, -200, -80, 'checked_out');
    $report = IssueReport::create([
        'booking_id' => $booking->id, 'user_id' => $student->id, 'room_id' => $room->id,
        'issue_category' => 'lighting', 'description' => 'Light flickers.', 'status' => 'submitted',
    ]);
    IssueReportAnalysis::create([
        'issue_report_id' => $report->id, 'state' => 'auto_accepted',
        'ai_category' => 'lighting', 'ai_severity' => 'low', 'ai_summary' => 'Light flickers.', 'ai_confidence' => 0.9,
        'final_category' => 'lighting', 'final_severity' => 'low', 'final_summary' => 'Light flickers.',
    ]);
    Sanctum::actingAs(sdUser('staff'));

    test()->getJson('/api/staff/dashboard')->assertOk()
        ->assertJsonPath('reports.0.ai.state', 'auto_accepted')
        ->assertJsonPath('reports.0.ai.category', 'lighting');
});