<?php

use App\Models\Booking;
use App\Models\IssueReport;
use App\Models\IssueReportAnalysis;
use App\Models\Room;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

/* Clock: Monday 16 Nov 2026, 07:00 in Malaysia (= Sunday 15 Nov, 23:00 UTC). */
beforeEach(function () {
    Carbon::setTestNow(Carbon::create(2026, 11, 15, 23, 0, 0, 'UTC'));

    Room::insert([
        ['room_code' => 'DISC-01', 'room_name' => 'Discussion Room 1', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
        ['room_code' => 'DISC-02', 'room_name' => 'Discussion Room 2', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
        ['room_code' => 'CAR-01', 'room_name' => 'Carrel Room 1', 'room_type' => 'carrel', 'capacity' => 1, 'status' => 'active'],
    ]);
});

afterEach(fn () => Carbon::setTestNow());

function rwStudent(): User
{
    $user = User::create(['name' => 'Aina', 'email' => uniqid('rw').'@graduate.utm.my', 'password' => 'Password123']);
    $user->role = 'student';
    $user->save();

    return $user;
}

/** An issue report for a room, $daysAgo days ago, optionally with a trusted AI severity. */
function rwReport(string $roomCode, string $category, int $daysAgo = 1, string $status = 'submitted', ?string $severity = null): IssueReport
{
    $student = rwStudent();
    $roomId = Room::where('room_code', $roomCode)->value('id');

    $booking = Booking::create([
        'user_id' => $student->id,
        'room_id' => $roomId,
        'start_at' => now()->subDays($daysAgo)->subHours(3),
        'end_at' => now()->subDays($daysAgo)->subHours(2),
        'status' => 'checked_out',
    ]);

    $report = new IssueReport([
        'booking_id' => $booking->id, 'user_id' => $student->id, 'room_id' => $roomId,
        'issue_category' => $category, 'description' => "Problem with $category.", 'status' => $status,
    ]);
    $report->created_at = now()->subDays($daysAgo);
    $report->save();

    if ($severity) {
        IssueReportAnalysis::create([
            'issue_report_id' => $report->id, 'state' => 'auto_accepted',
            'ai_category' => $category, 'ai_severity' => $severity, 'ai_summary' => 'A problem.', 'ai_confidence' => 0.9,
            'final_category' => $category, 'final_severity' => $severity, 'final_summary' => 'A problem.',
        ]);
    }

    return $report;
}

test('only signed-in users can see room notices', function () {
    test()->getJson('/api/room-notices')->assertUnauthorized();
});

test('open problems are grouped by room type, most serious first', function () {
    rwReport('DISC-01', 'wifi', 1);
    rwReport('DISC-01', 'wifi', 3);
    rwReport('DISC-02', 'power', 2, 'submitted', 'high');
    rwReport('CAR-01', 'lighting', 1);
    Sanctum::actingAs(rwStudent());

    $response = test()->getJson('/api/room-notices')->assertOk()
        ->assertJsonPath('window_days', 14)
        ->assertJsonCount(2, 'notices.discussion')
        ->assertJsonPath('notices.discussion.0.room_code', 'DISC-02')
        ->assertJsonPath('notices.discussion.0.label', 'Power')
        ->assertJsonPath('notices.discussion.0.urgent', true)
        ->assertJsonPath('notices.discussion.1.room_code', 'DISC-01')
        ->assertJsonPath('notices.discussion.1.label', 'Wi-Fi')
        ->assertJsonPath('notices.discussion.1.count', 2)
        ->assertJsonPath('notices.discussion.1.recurring', true)
        ->assertJsonPath('notices.carrel.0.recurring', false);

    // Never the students' own words
    expect($response->getContent())->not->toContain('Problem with');
});

test('resolved and old reports are not shown', function () {
    rwReport('DISC-01', 'wifi', 1, 'resolved');
    rwReport('DISC-01', 'lighting', 20);
    Sanctum::actingAs(rwStudent());

    test()->getJson('/api/room-notices')->assertOk()->assertExactJson(['window_days' => 14, 'notices' => []]);
});

test('booking prefers a free room without urgent or recurring problems', function () {
    rwReport('DISC-01', 'wifi', 1);
    rwReport('DISC-01', 'wifi', 2); // DISC-01 has a recurring problem
    Sanctum::actingAs(rwStudent());

    test()->postJson('/api/bookings', [
        'room_type' => 'discussion', 'date' => '2026-11-16', 'start_time' => '10:00', 'duration' => 2,
    ])->assertCreated()->assertJsonPath('booking.room_name', 'Discussion Room 2');
});

test('a room with problems is still given when it is the only free one', function () {
    rwReport('DISC-01', 'power', 1, 'submitted', 'high');
    Booking::create([
        'user_id' => rwStudent()->id,
        'room_id' => Room::where('room_code', 'DISC-02')->value('id'),
        'start_at' => Carbon::parse('2026-11-16 10:00', 'Asia/Kuala_Lumpur')->utc(),
        'end_at' => Carbon::parse('2026-11-16 12:00', 'Asia/Kuala_Lumpur')->utc(),
        'status' => 'confirmed',
    ]);
    Sanctum::actingAs(rwStudent());

    test()->postJson('/api/bookings', [
        'room_type' => 'discussion', 'date' => '2026-11-16', 'start_time' => '10:00', 'duration' => 2,
    ])->assertCreated()->assertJsonPath('booking.room_name', 'Discussion Room 1');
});