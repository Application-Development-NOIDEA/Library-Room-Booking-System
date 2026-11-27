<?php

use App\Models\Booking;
use App\Models\Room;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

/* Clock: Monday 16 Nov 2026, 07:00 in Malaysia. */
beforeEach(function () {
    Carbon::setTestNow(Carbon::create(2026, 11, 16, 7, 0, 0, 'Asia/Kuala_Lumpur'));

    Room::insert([
        ['room_code' => 'DISC-01', 'room_name' => 'Discussion Room 1', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
        ['room_code' => 'DISC-02', 'room_name' => 'Discussion Room 2', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
    ]);
});

afterEach(fn () => Carbon::setTestNow());

function smUser(string $role, ?string $matric = null): User
{
    $user = User::create(['name' => ucfirst($role).' '.uniqid(), 'email' => uniqid($role).'@graduate.utm.my', 'password' => 'Password123']);
    $user->role = $role;
    $user->student_id = $matric;
    $user->save();

    return $user;
}

function smRoom(string $code): int
{
    return (int) Room::where('room_code', $code)->value('id');
}

function smAdd(array $overrides = [])
{
    return test()->postJson('/api/staff/bookings', array_merge([
        'matric' => 'A24CS0001', 'room_id' => smRoom('DISC-01'), 'date' => '2026-11-16', 'start' => '10:00', 'end' => '12:00',
    ], $overrides));
}

test('only staff can manage bookings', function () {
    smAdd()->assertUnauthorized();

    Sanctum::actingAs(smUser('student', 'A24CS0009'));
    smAdd()->assertForbidden();
    test()->postJson('/api/staff/closures', [])->assertForbidden();
});

test('staff can add a booking for a student by matric number', function () {
    $aina = smUser('student', 'A24CS0001');
    Sanctum::actingAs(smUser('staff'));

    smAdd()->assertCreated()
        ->assertJsonPath('booking.room_name', 'Discussion Room 1')
        ->assertJsonPath('booking.start_time', '10:00')
        ->assertJsonPath('booking.status', 'confirmed');

    expect(Booking::where('user_id', $aina->id)->count())->toBe(1);
    expect(UserNotification::where('user_id', $aina->id)->where('message_type', 'booking_added_by_staff')->exists())->toBeTrue();
});

test('adding checks matric, hours, the one-week rule and clashes', function () {
    smUser('student', 'A24CS0001');
    smUser('student', 'A24CS0002');
    Sanctum::actingAs(smUser('staff'));

    smAdd(['matric' => 'NOPE'])->assertStatus(422)->assertJsonPath('message', 'No student account has that matric number.');
    smAdd(['start' => '07:00'])->assertStatus(422)->assertJsonPath('message', 'The library is open from 8:00 AM to 10:00 PM.');
    smAdd(['start' => '12:00', 'end' => '10:00'])->assertStatus(422);
    smAdd(['date' => '2026-11-25'])->assertStatus(422)->assertJsonPath('message', 'You can only book up to one week ahead.');

    smAdd()->assertCreated();
    smAdd(['matric' => 'A24CS0002', 'start' => '11:00', 'end' => '13:00'])
        ->assertStatus(409)
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'already booked from 10:00 AM–12:00 PM'));
});

test('staff can move a booking, and the student is told', function () {
    $aina = smUser('student', 'A24CS0001');
    Sanctum::actingAs(smUser('staff'));
    $id = smAdd()->json('booking.id');

    test()->patchJson("/api/staff/bookings/{$id}", [
        'room_id' => smRoom('DISC-02'), 'date' => '2026-11-17', 'start' => '14:00', 'end' => '16:00',
    ])->assertOk()
        ->assertJsonPath('booking.room_name', 'Discussion Room 2')
        ->assertJsonPath('booking.date', '2026-11-17')
        ->assertJsonPath('booking.start_time', '14:00');

    // Moving within its own old time is fine (it doesn't clash with itself)
    test()->patchJson("/api/staff/bookings/{$id}", [
        'room_id' => smRoom('DISC-02'), 'date' => '2026-11-17', 'start' => '15:00', 'end' => '17:00',
    ])->assertOk();

    expect(UserNotification::where('user_id', $aina->id)->where('message_type', 'booking_changed_by_staff')->count())->toBe(2);
});

test('staff can cancel a booking with a reason', function () {
    $aina = smUser('student', 'A24CS0001');
    Sanctum::actingAs(smUser('staff'));
    $id = smAdd()->json('booking.id');

    test()->postJson("/api/staff/bookings/{$id}/cancel", ['reason' => 'Room needed for an exam.'])
        ->assertOk()->assertJsonPath('booking.status', 'cancelled');

    $note = UserNotification::where('user_id', $aina->id)->where('message_type', 'booking_cancelled_by_staff')->first();
    expect($note->message)->toContain('Reason: Room needed for an exam.');

    test()->postJson("/api/staff/bookings/{$id}/cancel")->assertStatus(422); // already cancelled
});

test('a closed room cannot be booked by students, and reopening frees it', function () {
    Sanctum::actingAs(smUser('staff'));

    $closureId = test()->postJson('/api/staff/closures', [
        'room_id' => smRoom('DISC-01'), 'date' => '2026-11-16', 'start' => '14:00', 'end' => '17:00',
    ])->assertCreated()->assertJsonPath('closure.is_closure', true)->json('closure.id');

    // Close the other room too, so nothing is free 2-5 PM
    test()->postJson('/api/staff/closures', [
        'room_id' => smRoom('DISC-02'), 'date' => '2026-11-16', 'start' => '14:00', 'end' => '17:00',
    ])->assertCreated();

    test()->getJson('/api/staff/closures')->assertOk()->assertJsonCount(2, 'closures');

    // Staff can't put a booking in a closed room either
    smUser('student', 'A24CS0001');
    smAdd(['start' => '15:00', 'end' => '16:00'])->assertStatus(409)
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'closed by staff'));

    // Students can't book it
    Sanctum::actingAs(smUser('student', 'A24CS0005'));
    $blocked = test()->postJson('/api/bookings', ['room_type' => 'discussion', 'date' => '2026-11-16', 'start_time' => '15:00', 'duration' => 1]);
    expect($blocked->status())->not->toBe(201);

    // Reopen one room: now it can be booked
    Sanctum::actingAs(User::where('role', 'staff')->first());
    test()->deleteJson("/api/staff/closures/{$closureId}")->assertOk();

    Sanctum::actingAs(smUser('student', 'A24CS0006'));
    test()->postJson('/api/bookings', ['room_type' => 'discussion', 'date' => '2026-11-16', 'start_time' => '15:00', 'duration' => 1])
        ->assertCreated()->assertJsonPath('booking.room_name', 'Discussion Room 1');
});

test('closures never become no-shows', function () {
    Sanctum::actingAs(smUser('staff'));
    $id = test()->postJson('/api/staff/closures', [
        'room_id' => smRoom('DISC-01'), 'date' => '2026-11-16', 'start' => '08:00', 'end' => '12:00',
    ])->json('closure.id');

    Carbon::setTestNow(Carbon::create(2026, 11, 16, 9, 0, 0, 'Asia/Kuala_Lumpur'));
    app(\App\Services\WaitingListService::class)->process();

    expect(Booking::find($id)->status)->toBe('held');
});