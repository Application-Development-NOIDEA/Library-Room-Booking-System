<?php

use App\Models\Booking;
use App\Models\IssueReport;
use App\Models\Room;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

/* Clock: Monday 16 Nov 2026, 15:00 in Malaysia (= 07:00 UTC). */
beforeEach(function () {
    Carbon::setTestNow(Carbon::create(2026, 11, 16, 7, 0, 0, 'UTC'));
    Storage::fake('public');

    Room::insert([
        ['room_code' => 'DISC-01', 'room_name' => 'Discussion Room 1', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
    ]);
});

afterEach(fn () => Carbon::setTestNow());

function rpStudent(string $name): User
{
    $user = User::create([
        'name' => $name,
        'email' => strtolower($name).'@graduate.utm.my',
        'password' => 'Password123',
    ]);
    $user->role = 'student';
    $user->save();

    return $user;
}

/** A booking at a Malaysian time. */
function rpBooking(User $user, string $start, string $end, string $status = 'checked_out'): Booking
{
    return Booking::create([
        'user_id' => $user->id,
        'room_id' => Room::value('id'),
        'start_at' => Carbon::parse($start, 'Asia/Kuala_Lumpur')->utc(),
        'end_at' => Carbon::parse($end, 'Asia/Kuala_Lumpur')->utc(),
        'status' => $status,
    ]);
}

function rpSend(array $fields)
{
    return test()->post('/api/reports', $fields, ['Accept' => 'application/json']);
}

test('guests cannot report issues', function () {
    test()->getJson('/api/reports/bookings')->assertUnauthorized();
    rpSend([])->assertUnauthorized();
});

test('only your own bookings that have started can be reported', function () {
    $aina = rpStudent('Aina');
    $past = rpBooking($aina, '2026-11-14 10:00', '2026-11-14 12:00');
    $now = rpBooking($aina, '2026-11-16 14:00', '2026-11-16 16:00', 'confirmed');
    rpBooking($aina, '2026-11-17 10:00', '2026-11-17 12:00', 'confirmed');   // future
    rpBooking($aina, '2026-11-13 10:00', '2026-11-13 12:00', 'cancelled');   // cancelled
    rpBooking($aina, '2026-09-01 10:00', '2026-09-01 12:00');                // too long ago
    rpBooking(rpStudent('Ben'), '2026-11-15 10:00', '2026-11-15 12:00');      // not yours

    Sanctum::actingAs($aina);

    test()->getJson('/api/reports/bookings')->assertOk()
        ->assertJsonCount(2, 'bookings')
        ->assertJsonPath('bookings.0.id', $now->id)
        ->assertJsonPath('bookings.1.id', $past->id)
        ->assertJsonPath('bookings.1.room_name', 'Discussion Room 1');
});

test('a student can report an issue with a photo', function () {
    $aina = rpStudent('Aina');
    $booking = rpBooking($aina, '2026-11-14 10:00', '2026-11-14 12:00');
    Sanctum::actingAs($aina);

    $response = rpSend([
        'booking_id' => $booking->id,
        'issue_category' => 'lighting',
        'description' => 'The ceiling light near the whiteboard keeps flickering.',
        'image' => UploadedFile::fake()->image('light.jpg', 640, 480),
    ])->assertCreated()
        ->assertJsonPath('report.room_name', 'Discussion Room 1')
        ->assertJsonPath('report.issue_category', 'lighting')
        ->assertJsonPath('report.status', 'submitted');

    $report = IssueReport::first();
    expect($report->user_id)->toBe($aina->id);
    expect($report->room_id)->toBe($booking->room_id);
    expect($report->image_path)->toStartWith('issue-reports/');
    Storage::disk('public')->assertExists($report->image_path);
    expect($response->json('report.image_url'))->toContain($report->image_path);
});

test('a photo is optional', function () {
    $aina = rpStudent('Aina');
    $booking = rpBooking($aina, '2026-11-14 10:00', '2026-11-14 12:00');
    Sanctum::actingAs($aina);

    rpSend([
        'booking_id' => $booking->id,
        'issue_category' => 'wifi',
        'description' => 'Wi-Fi keeps disconnecting every few minutes.',
    ])->assertCreated()->assertJsonPath('report.image_url', null);
});

test('bad reports are rejected with a clear message', function () {
    $aina = rpStudent('Aina');
    $booking = rpBooking($aina, '2026-11-14 10:00', '2026-11-14 12:00');
    $future = rpBooking($aina, '2026-11-18 10:00', '2026-11-18 12:00', 'confirmed');
    $bens = rpBooking(rpStudent('Ben'), '2026-11-14 10:00', '2026-11-14 12:00');
    Sanctum::actingAs($aina);

    $valid = ['booking_id' => $booking->id, 'issue_category' => 'furniture', 'description' => 'The chair by the window is broken.'];

    rpSend(array_merge($valid, ['issue_category' => 'aliens']))
        ->assertStatus(422)->assertJsonPath('message', 'Choose what kind of problem it is.');
    rpSend(array_merge($valid, ['description' => 'Broken']))
        ->assertStatus(422)->assertJsonPath('message', 'Describe the problem in at least 10 characters.');
    rpSend(array_merge($valid, ['image' => UploadedFile::fake()->create('notes.pdf', 100, 'application/pdf')]))
        ->assertStatus(422)->assertJsonPath('message', 'Use a JPG, PNG or WEBP photo.');
    rpSend(array_merge($valid, ['booking_id' => $future->id]))->assertStatus(422);
    rpSend(array_merge($valid, ['booking_id' => $bens->id]))->assertStatus(422);

    expect(IssueReport::count())->toBe(0);
});

test('my reports lists only my own, newest first', function () {
    $aina = rpStudent('Aina');
    $ben = rpStudent('Ben');
    $booking = rpBooking($aina, '2026-11-14 10:00', '2026-11-14 12:00');
    $bensBooking = rpBooking($ben, '2026-11-14 10:00', '2026-11-14 12:00');

    IssueReport::create(['booking_id' => $booking->id, 'user_id' => $aina->id, 'room_id' => $booking->room_id,
        'issue_category' => 'power', 'description' => 'Socket near the door has no power.', 'status' => 'resolved']);
    IssueReport::create(['booking_id' => $booking->id, 'user_id' => $aina->id, 'room_id' => $booking->room_id,
        'issue_category' => 'cleanliness', 'description' => 'Rubbish left on the table.', 'status' => 'in_progress']);
    IssueReport::create(['booking_id' => $bensBooking->id, 'user_id' => $ben->id, 'room_id' => $bensBooking->room_id,
        'issue_category' => 'other', 'description' => 'Not Aina\'s report at all.']);

    Sanctum::actingAs($aina);

    test()->getJson('/api/reports/mine')->assertOk()
        ->assertJsonCount(2, 'reports')
        ->assertJsonPath('reports.0.issue_category', 'cleanliness')
        ->assertJsonPath('reports.0.status', 'in_progress')
        ->assertJsonPath('reports.1.status', 'resolved')
        ->assertJsonPath('reports.1.room_name', 'Discussion Room 1');
});