<?php

use App\Models\Booking;
use App\Models\Room;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    // Monday 16 Nov 2026, 07:00 in Malaysia
    Carbon::setTestNow(Carbon::create(2026, 11, 16, 7, 0, 0, 'Asia/Kuala_Lumpur'));

    Room::insert([
        ['room_code' => 'DISC-01', 'room_name' => 'Discussion Room 1', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
        ['room_code' => 'DISC-02', 'room_name' => 'Discussion Room 2', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
        ['room_code' => 'DISC-03', 'room_name' => 'Discussion Room 3', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'maintenance'],
        ['room_code' => 'CARREL-01', 'room_name' => 'Carrel 1', 'room_type' => 'carrel', 'capacity' => 1, 'status' => 'active'],
    ]);
});

afterEach(fn () => Carbon::setTestNow());

function overlapStudent(string $email): User
{
    $user = User::create(['name' => 'Student', 'email' => $email, 'password' => 'Password123', 'student_id' => null]);
    $user->role = 'student';
    $user->save();

    return $user;
}

function overlapBook(array $overrides = [])
{
    return test()->postJson('/api/bookings', array_merge([
        'room_type' => 'discussion',
        'date' => '2026-11-16',
        'start_time' => '10:00',
        'duration' => 2,
    ], $overrides));
}

/** Fill both active discussion rooms 10:00-12:00 (Malaysia time) with the given status. */
function fillDiscussionRooms(string $status): void
{
    $rooms = Room::where('room_type', 'discussion')->where('status', 'active')->get();

    foreach ($rooms as $i => $room) {
        Booking::create([
            'user_id' => overlapStudent("filler{$i}@utm.my")->id,
            'room_id' => $room->id,
            'start_at' => Carbon::create(2026, 11, 16, 2, 0, 0, 'UTC'),
            'end_at' => Carbon::create(2026, 11, 16, 4, 0, 0, 'UTC'),
            'status' => $status,
        ]);
    }
}

test('back-to-back bookings in the same room are allowed', function () {
    Sanctum::actingAs(overlapStudent('a@utm.my'));
    overlapBook(['start_time' => '10:00'])->assertCreated()->assertJsonPath('booking.room_name', 'Discussion Room 1');

    // Starts exactly when the first one ends, and ends exactly when it starts: both reuse room 1.
    Sanctum::actingAs(overlapStudent('b@utm.my'));
    overlapBook(['start_time' => '12:00'])->assertCreated()->assertJsonPath('booking.room_name', 'Discussion Room 1');

    Sanctum::actingAs(overlapStudent('c@utm.my'));
    overlapBook(['start_time' => '08:00'])->assertCreated()->assertJsonPath('booking.room_name', 'Discussion Room 1');
});

test('one student can book two consecutive slots', function () {
    Sanctum::actingAs(overlapStudent('a@utm.my'));

    overlapBook(['start_time' => '10:00', 'duration' => 1])->assertCreated();
    overlapBook(['start_time' => '11:00', 'duration' => 1])->assertCreated();
});

test('a booking that sits inside a longer one blocks that room', function () {
    Sanctum::actingAs(overlapStudent('a@utm.my'));
    overlapBook(['start_time' => '11:00', 'duration' => 1])->assertCreated(); // room 1, 11-12

    Sanctum::actingAs(overlapStudent('b@utm.my'));
    overlapBook(['start_time' => '10:00', 'duration' => 2])
        ->assertCreated()
        ->assertJsonPath('booking.room_name', 'Discussion Room 2'); // 10-12 overlaps room 1

    Sanctum::actingAs(overlapStudent('c@utm.my'));
    overlapBook(['start_time' => '10:00', 'duration' => 2])->assertStatus(409); // both rooms taken
});

test('bookings on different dates never conflict', function () {
    Sanctum::actingAs(overlapStudent('a@utm.my'));
    overlapBook(['date' => '2026-11-16'])->assertCreated()->assertJsonPath('booking.room_name', 'Discussion Room 1');

    Sanctum::actingAs(overlapStudent('b@utm.my'));
    overlapBook(['date' => '2026-11-17'])->assertCreated()->assertJsonPath('booking.room_name', 'Discussion Room 1');
});

test('a room under maintenance is never assigned', function () {
    Sanctum::actingAs(overlapStudent('a@utm.my'));
    overlapBook()->assertCreated();
    Sanctum::actingAs(overlapStudent('b@utm.my'));
    overlapBook()->assertCreated();

    // DISC-03 is free but under maintenance, so the third student is refused.
    Sanctum::actingAs(overlapStudent('c@utm.my'));
    overlapBook()->assertStatus(409);
});

test('cancelled, no-show and checked-out bookings free the room', function (string $status) {
    fillDiscussionRooms($status);

    Sanctum::actingAs(overlapStudent('new@utm.my'));
    overlapBook()->assertCreated();
})->with(['cancelled', 'no_show', 'checked_out']);

test('held, confirmed and checked-in bookings still block the room', function (string $status) {
    fillDiscussionRooms($status);

    Sanctum::actingAs(overlapStudent('new@utm.my'));
    overlapBook()->assertStatus(409);
})->with(['held', 'confirmed', 'checked_in']);

test('a carrel block is taken by one student and the next block is still free', function () {
    Sanctum::actingAs(overlapStudent('a@utm.my'));
    overlapBook(['room_type' => 'carrel', 'start_time' => '08:00', 'duration' => 4])->assertCreated();

    Sanctum::actingAs(overlapStudent('b@utm.my'));
    overlapBook(['room_type' => 'carrel', 'start_time' => '08:00', 'duration' => 4])->assertStatus(409);
    overlapBook(['room_type' => 'carrel', 'start_time' => '12:00', 'duration' => 4])->assertCreated();
});

test('availability counts overlapping bookings and ignores maintenance rooms', function () {
    $a = overlapStudent('a@utm.my');
    Sanctum::actingAs($a);
    overlapBook(['start_time' => '10:00', 'duration' => 2])->assertCreated(); // 10:00-12:00

    $slots = collect(
        $this->getJson('/api/rooms/discussion/availability?date=2026-11-16&duration=1')->assertOk()->json('slots')
    )->keyBy('start_time');

    // Only the two active rooms count; the maintenance room is not part of "total".
    expect($slots['09:00']['total'])->toBe(2)
        ->and($slots['09:00']['free'])->toBe(2)
        ->and($slots['10:00']['free'])->toBe(1)
        ->and($slots['11:00']['free'])->toBe(1)
        ->and($slots['12:00']['free'])->toBe(2);

    // The student who booked sees their own bookings and cannot pick those slots again.
    expect($slots['10:00']['you_have_booking'])->toBeTrue()
        ->and($slots['10:00']['available'])->toBeFalse()
        ->and($slots['12:00']['you_have_booking'])->toBeFalse();

    // Another student still sees them as available (one room left).
    Sanctum::actingAs(overlapStudent('b@utm.my'));
    $other = collect(
        $this->getJson('/api/rooms/discussion/availability?date=2026-11-16&duration=1')->json('slots')
    )->keyBy('start_time');

    expect($other['10:00']['you_have_booking'])->toBeFalse()
        ->and($other['10:00']['available'])->toBeTrue();
});

test('a fully booked slot shows no free rooms and is not available', function () {
    Sanctum::actingAs(overlapStudent('a@utm.my'));
    overlapBook(['start_time' => '10:00', 'duration' => 1])->assertCreated();
    Sanctum::actingAs(overlapStudent('b@utm.my'));
    overlapBook(['start_time' => '10:00', 'duration' => 1])->assertCreated();

    Sanctum::actingAs(overlapStudent('c@utm.my'));
    $ten = collect(
        $this->getJson('/api/rooms/discussion/availability?date=2026-11-16&duration=1')->json('slots')
    )->firstWhere('start_time', '10:00');

    expect($ten['free'])->toBe(0)->and($ten['available'])->toBeFalse();
});

test('availability refuses room types that cannot be booked', function () {
    Sanctum::actingAs(overlapStudent('a@utm.my'));

    $this->getJson('/api/rooms/lobby/availability?date=2026-11-16')->assertStatus(422);
});