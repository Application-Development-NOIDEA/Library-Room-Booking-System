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
        ['room_code' => 'CARREL-01', 'room_name' => 'Carrel 1', 'room_type' => 'carrel', 'capacity' => 1, 'status' => 'active'],
        ['room_code' => 'LOBBY', 'room_name' => 'Lobby Area', 'room_type' => 'lobby', 'capacity' => 0, 'status' => 'active'],
    ]);
});

afterEach(fn () => Carbon::setTestNow());

function student(string $email = 'ariana@graduate.utm.my'): User
{
    $user = User::create(['name' => 'Student', 'email' => $email, 'password' => 'Password123', 'student_id' => null]);
    $user->role = 'student';
    $user->save();

    return $user;
}

function book(array $overrides = [])
{
    return test()->postJson('/api/bookings', array_merge([
        'room_type' => 'discussion',
        'date' => '2026-11-16',
        'start_time' => '10:00',
        'duration' => 2,
    ], $overrides));
}

test('guests cannot book', function () {
    book()->assertUnauthorized();
});

test('a student can book a free room', function () {
    Sanctum::actingAs(student());

    book()->assertCreated()
        ->assertJsonPath('booking.room_name', 'Discussion Room 1')
        ->assertJsonPath('booking.start_time', '10:00')
        ->assertJsonPath('booking.end_time', '12:00')
        ->assertJsonPath('booking.status', 'confirmed')
        ->assertJsonPath('booking.tab', 'upcoming');

    // Stored in UTC: 10:00 Malaysia = 02:00 UTC
    expect(Booking::first()->start_at->utc()->format('H:i'))->toBe('02:00');
});

test('the next student gets the next free room, then the type is full', function () {
    Sanctum::actingAs(student('a@utm.my'));
    book()->assertCreated()->assertJsonPath('booking.room_name', 'Discussion Room 1');

    Sanctum::actingAs(student('b@utm.my'));
    book()->assertCreated()->assertJsonPath('booking.room_name', 'Discussion Room 2');

    Sanctum::actingAs(student('c@utm.my'));
    book()->assertStatus(409);
});

test('overlapping but not identical times also count as taken', function () {
    Sanctum::actingAs(student('a@utm.my'));
    book(['start_time' => '10:00', 'duration' => 2])->assertCreated();
    Sanctum::actingAs(student('b@utm.my'));
    book(['start_time' => '11:00', 'duration' => 1])->assertCreated(); // room 2

    Sanctum::actingAs(student('c@utm.my'));
    book(['start_time' => '11:00', 'duration' => 2])->assertStatus(409);
    book(['start_time' => '12:00', 'duration' => 1])->assertCreated(); // room 1 is free again at 12
});

test('a student cannot hold two bookings at the same time', function () {
    Sanctum::actingAs(student());
    book()->assertCreated();
    book(['room_type' => 'carrel', 'start_time' => '08:00', 'duration' => 4])
        ->assertStatus(422)
        ->assertJsonPath('message', 'You already have a booking at that time.');
});

test('a student can have at most three upcoming bookings', function () {
    Sanctum::actingAs(student());
    book(['start_time' => '09:00', 'duration' => 1])->assertCreated();
    book(['start_time' => '11:00', 'duration' => 1])->assertCreated();
    book(['start_time' => '13:00', 'duration' => 1])->assertCreated();
    book(['start_time' => '15:00', 'duration' => 1])->assertStatus(422);
});

test('invalid slots, past times and far dates are rejected', function () {
    Sanctum::actingAs(student());

    book(['room_type' => 'carrel', 'start_time' => '09:00', 'duration' => 4])->assertStatus(422); // not a carrel block
    book(['duration' => 3])->assertStatus(422);                                                   // hourly rooms: 1 or 2 hours
    book(['start_time' => '21:00', 'duration' => 2])->assertStatus(422);                          // ends after closing
    book(['date' => '2026-11-15'])->assertStatus(422);                                            // yesterday
    book(['date' => '2026-12-15'])->assertStatus(422);                                            // more than 14 days ahead
    book(['room_type' => 'lobby'])->assertStatus(422);                                            // not bookable

    Carbon::setTestNow(Carbon::create(2026, 11, 16, 10, 30, 0, 'Asia/Kuala_Lumpur'));
    book(['start_time' => '10:00'])->assertStatus(422);                                           // already started
});

test('availability shows free rooms per slot', function () {
    Sanctum::actingAs(student('a@utm.my'));
    book(['start_time' => '10:00', 'duration' => 1])->assertCreated();

    Sanctum::actingAs(student('b@utm.my'));
    $slots = $this->getJson('/api/rooms/discussion/availability?date=2026-11-16&duration=1')
        ->assertOk()
        ->assertJsonPath('durations', [1, 2])
        ->json('slots');

    $ten = collect($slots)->firstWhere('start_time', '10:00');
    expect($ten['free'])->toBe(1)->and($ten['total'])->toBe(2)->and($ten['available'])->toBeTrue();
    expect(collect($slots)->firstWhere('start_time', '21:00')['end_time'])->toBe('22:00');
});

test('my bookings lists only my own bookings', function () {
    Sanctum::actingAs(student('a@utm.my'));
    book()->assertCreated();

    Sanctum::actingAs(student('b@utm.my'));
    $this->getJson('/api/bookings/mine')->assertOk()->assertJsonCount(0, 'bookings');
});

test('a student can cancel their own upcoming booking but not someone else\'s', function () {
    $owner = student('a@utm.my');
    Sanctum::actingAs($owner);
    $id = book()->json('booking.id');

    Sanctum::actingAs(student('b@utm.my'));
    $this->postJson("/api/bookings/{$id}/cancel")->assertForbidden();

    Sanctum::actingAs($owner);
    $this->postJson("/api/bookings/{$id}/cancel")
        ->assertOk()
        ->assertJsonPath('booking.status', 'cancelled')
        ->assertJsonPath('booking.tab', 'cancelled');

    // The room is free again
    Sanctum::actingAs(student('c@utm.my'));
    book()->assertCreated()->assertJsonPath('booking.room_name', 'Discussion Room 1');
});
