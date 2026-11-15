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
    ]);
});

afterEach(fn () => Carbon::setTestNow());

function staffTestUser(string $role, string $email): User
{
    $user = User::create(['name' => ucfirst($role), 'email' => $email, 'password' => 'Password123', 'student_id' => null]);
    $user->role = $role;
    $user->save();

    return $user;
}

function staffTestBooking(User $user, string $start, string $end, string $status = 'confirmed'): Booking
{
    return Booking::create([
        'user_id'  => $user->id,
        'room_id'  => Room::first()->id,
        'start_at' => Carbon::parse($start, 'Asia/Kuala_Lumpur')->setTimezone('UTC'),
        'end_at'   => Carbon::parse($end, 'Asia/Kuala_Lumpur')->setTimezone('UTC'),
        'status'   => $status,
    ]);
}

test('guests cannot see the staff reservation list', function () {
    $this->getJson('/api/staff/bookings')->assertUnauthorized();
});

test('students cannot see the staff reservation list', function () {
    Sanctum::actingAs(staffTestUser('student', 's@graduate.utm.my'));

    $this->getJson('/api/staff/bookings')->assertForbidden();
});

test('staff see only today\'s reservations by default', function () {
    $student = staffTestUser('student', 's@graduate.utm.my');
    staffTestBooking($student, '2026-11-16 10:00', '2026-11-16 11:00');
    staffTestBooking($student, '2026-11-17 10:00', '2026-11-17 11:00');

    Sanctum::actingAs(staffTestUser('staff', 'staff@utm.my'));

    $this->getJson('/api/staff/bookings')
        ->assertOk()
        ->assertJsonCount(1, 'bookings')
        ->assertJsonPath('bookings.0.student', 'Student')
        ->assertJsonPath('bookings.0.room_name', 'Discussion Room 1')
        ->assertJsonPath('bookings.0.start_time', '10:00')
        ->assertJsonPath('bookings.0.status_label', 'Confirmed');
});

test('staff can pick another date and filter by status', function () {
    $student = staffTestUser('student', 's@graduate.utm.my');
    staffTestBooking($student, '2026-11-17 10:00', '2026-11-17 11:00');
    staffTestBooking($student, '2026-11-17 12:00', '2026-11-17 13:00', 'cancelled');

    Sanctum::actingAs(staffTestUser('staff', 'staff@utm.my'));

    $this->getJson('/api/staff/bookings?date=2026-11-17')->assertJsonCount(2, 'bookings');
    $this->getJson('/api/staff/bookings?date=2026-11-17&status=cancelled')
        ->assertJsonCount(1, 'bookings')
        ->assertJsonPath('bookings.0.status', 'cancelled');
});

test('all=1 lists reservations from every date', function () {
    $student = staffTestUser('student', 's@graduate.utm.my');
    staffTestBooking($student, '2026-11-16 10:00', '2026-11-16 11:00');
    staffTestBooking($student, '2026-11-18 10:00', '2026-11-18 11:00');

    Sanctum::actingAs(staffTestUser('staff', 'staff@utm.my'));

    $this->getJson('/api/staff/bookings?all=1')->assertJsonCount(2, 'bookings');
});

test('an invalid status is rejected', function () {
    Sanctum::actingAs(staffTestUser('staff', 'staff@utm.my'));

    $this->getJson('/api/staff/bookings?status=banana')->assertUnprocessable();
});