<?php

use App\Mail\NotificationMail;
use App\Models\Booking;
use App\Models\Room;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

/* Clock: Monday 16 Nov 2026, 07:00 in Malaysia. */
beforeEach(function () {
    Carbon::setTestNow(Carbon::create(2026, 11, 16, 7, 0, 0, 'Asia/Kuala_Lumpur'));

    Room::insert([
        ['room_code' => 'CAR-01', 'room_name' => 'Carrel 1', 'room_type' => 'carrel', 'capacity' => 1, 'status' => 'active'],
        ['room_code' => 'CAR-02', 'room_name' => 'Carrel 2', 'room_type' => 'carrel', 'capacity' => 1, 'status' => 'active'],
        ['room_code' => 'CAR-03', 'room_name' => 'Carrel 3', 'room_type' => 'carrel', 'capacity' => 1, 'status' => 'maintenance'],
    ]);
});

afterEach(fn () => Carbon::setTestNow());

function wkStudent(string $name = 'Aina'): User
{
    $user = User::create(['name' => $name, 'email' => uniqid('wk').'@graduate.utm.my', 'password' => 'Password123']);
    $user->role = 'student';
    $user->save();

    return $user;
}

function wkBook(string $date)
{
    return test()->postJson('/api/bookings', [
        'room_type' => 'carrel', 'date' => $date, 'start_time' => '08:00', 'duration' => 4,
    ]);
}

test('bookings are limited to one week ahead', function () {
    Sanctum::actingAs(wkStudent());

    wkBook('2026-11-22')->assertCreated(); // today + 6 days: last day allowed
    wkBook('2026-11-23')->assertStatus(422)   // today + 7 days: too far
        ->assertJsonPath('message', 'You can only book up to one week ahead.');
});

test('the carrel list shows each carrel and whether it is free now', function () {
    Carbon::setTestNow(Carbon::create(2026, 11, 16, 9, 0, 0, 'Asia/Kuala_Lumpur'));
    $carrel1 = Room::where('room_code', 'CAR-01')->value('id');
    $carrel2 = Room::where('room_code', 'CAR-02')->value('id');

    $owner = wkStudent('Owner');
    Booking::create(['user_id' => $owner->id, 'room_id' => $carrel1, 'status' => 'checked_in',
        'start_at' => Carbon::parse('2026-11-16 08:00', 'Asia/Kuala_Lumpur')->utc(),
        'end_at' => Carbon::parse('2026-11-16 12:00', 'Asia/Kuala_Lumpur')->utc()]);
    Booking::create(['user_id' => $owner->id, 'room_id' => $carrel2, 'status' => 'confirmed',
        'start_at' => Carbon::parse('2026-11-16 14:00', 'Asia/Kuala_Lumpur')->utc(),
        'end_at' => Carbon::parse('2026-11-16 18:00', 'Asia/Kuala_Lumpur')->utc()]);

    test()->getJson('/api/room-list/carrel')->assertUnauthorized();

    Sanctum::actingAs(wkStudent());
    $response = test()->getJson('/api/room-list/carrel')->assertOk()
        ->assertJsonPath('total', 3)
        ->assertJsonPath('free', 1)
        ->assertJsonPath('rooms.0.room_code', 'CAR-01')
        ->assertJsonPath('rooms.0.status', 'in_use')
        ->assertJsonPath('rooms.0.free_at', '12:00 PM')
        ->assertJsonPath('rooms.1.status', 'free')
        ->assertJsonPath('rooms.1.next_booking_at', '2:00 PM')
        ->assertJsonPath('rooms.2.status', 'closed');

    expect($response->getContent())->not->toContain('Owner'); // never who booked it
    test()->getJson('/api/room-list/swimming-pool')->assertNotFound();
});

test('new notifications are also emailed, reminders are not emailed twice', function () {
    Mail::fake();
    $aina = wkStudent();

    UserNotification::create(['user_id' => $aina->id, 'message_type' => 'waiting_list_offer',
        'message' => 'Carrel 2 is held for you until 9:10 AM.', 'status' => 'sent']);
    UserNotification::create(['user_id' => $aina->id, 'message_type' => 'booking_start_reminder',
        'message' => 'Your booking starts in 30 minutes.', 'status' => 'sent']);

    Mail::assertSent(NotificationMail::class, 1);
    Mail::assertSent(NotificationMail::class, fn (NotificationMail $mail) => $mail->hasTo($aina->email)
        && $mail->title === 'A room is free for you'
        && $mail->urgent === true);
});