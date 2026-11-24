<?php

use App\Models\Booking;
use App\Models\IssueReport;
use App\Models\IssueReportAnalysis;
use App\Models\Room;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

function srUser(string $role): User
{
    $user = User::create(['name' => ucfirst($role), 'email' => uniqid($role).'@utm.my', 'password' => 'Password123']);
    $user->role = $role;
    $user->save();

    return $user;
}

/** A report plus its analysis row, in the given state. */
function srItem(string $state, array $analysis = []): IssueReport
{
    if (! Room::exists()) {
        Room::insert([['room_code' => 'DISC-01', 'room_name' => 'Discussion Room 1', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active']]);
    }

    $student = srUser('student');
    $booking = Booking::create([
        'user_id' => $student->id,
        'room_id' => Room::value('id'),
        'start_at' => now()->subDays(2),
        'end_at' => now()->subDays(2)->addHours(2),
        'status' => 'checked_out',
    ]);

    $report = IssueReport::create([
        'booking_id' => $booking->id,
        'user_id' => $student->id,
        'room_id' => $booking->room_id,
        'issue_category' => 'lighting',
        'description' => 'The ceiling light keeps flickering.',
        'status' => 'submitted',
    ]);

    IssueReportAnalysis::create(array_merge([
        'issue_report_id' => $report->id,
        'state' => $state,
        'review_reason' => $state === 'needs_review' ? 'ai_error' : null,
    ], $analysis));

    return $report;
}

function srValidReview(array $override = []): array
{
    return array_merge([
        'category' => 'power',
        'severity' => 'high',
        'summary' => 'Socket near the door has no power.',
        'note' => 'Checked the photo.',
    ], $override);
}

test('guests and students cannot use the review queue', function () {
    $report = srItem('needs_review');

    test()->getJson('/api/staff/issue-reports/review')->assertUnauthorized();
    test()->postJson("/api/staff/issue-reports/{$report->id}/review", srValidReview())->assertUnauthorized();

    Sanctum::actingAs(srUser('student'));
    test()->getJson('/api/staff/issue-reports/review')->assertForbidden();
    test()->postJson("/api/staff/issue-reports/{$report->id}/review", srValidReview())->assertForbidden();
});

test('staff see only the reports waiting for review, oldest first, with the AI suggestion', function () {
    $first = srItem('needs_review', [
        'review_reason' => 'low_confidence',
        'ai_category' => 'lighting', 'ai_severity' => 'low',
        'ai_summary' => 'Light flickers.', 'ai_confidence' => 0.4,
    ]);
    $second = srItem('needs_review');
    srItem('auto_accepted', ['final_category' => 'lighting']);
    srItem('staff_reviewed', ['final_category' => 'power']);

    Sanctum::actingAs(srUser('staff'));

    test()->getJson('/api/staff/issue-reports/review')->assertOk()
        ->assertJsonPath('pending_count', 2)
        ->assertJsonCount(2, 'items')
        ->assertJsonPath('items.0.report_id', $first->id)
        ->assertJsonPath('items.0.reason', 'low_confidence')
        ->assertJsonPath('items.0.ai_suggestion.category', 'lighting')
        ->assertJsonPath('items.0.ai_suggestion.confidence', 0.4)
        ->assertJsonPath('items.0.room_name', 'Discussion Room 1')
        ->assertJsonPath('items.1.report_id', $second->id)
        ->assertJsonPath('items.1.ai_suggestion', null);
});

test('staff can review a report, which then leaves the queue', function () {
    $report = srItem('needs_review');
    $staff = srUser('staff');
    Sanctum::actingAs($staff);

    test()->postJson("/api/staff/issue-reports/{$report->id}/review", srValidReview())
        ->assertOk()
        ->assertJsonPath('review.state', 'staff_reviewed')
        ->assertJsonPath('review.category', 'power')
        ->assertJsonPath('review.severity', 'high');

    $analysis = IssueReportAnalysis::where('issue_report_id', $report->id)->first();
    expect($analysis->state)->toBe('staff_reviewed');
    expect($analysis->final_category)->toBe('power');
    expect($analysis->final_summary)->toBe('Socket near the door has no power.');
    expect($analysis->reviewed_by)->toBe($staff->id);
    expect($analysis->reviewed_at)->not->toBeNull();
    expect($analysis->review_note)->toBe('Checked the photo.');

    test()->getJson('/api/staff/issue-reports/review')->assertJsonPath('pending_count', 0);
});

test('a report can only be reviewed once, and only if it needs review', function () {
    $needs = srItem('needs_review');
    $accepted = srItem('auto_accepted', ['final_category' => 'lighting']);
    Sanctum::actingAs(srUser('staff'));

    test()->postJson("/api/staff/issue-reports/{$needs->id}/review", srValidReview())->assertOk();
    test()->postJson("/api/staff/issue-reports/{$needs->id}/review", srValidReview(['category' => 'wifi']))->assertStatus(409);
    test()->postJson("/api/staff/issue-reports/{$accepted->id}/review", srValidReview())->assertStatus(409);

    expect(IssueReportAnalysis::where('issue_report_id', $needs->id)->value('final_category'))->toBe('power');
    expect(IssueReportAnalysis::where('issue_report_id', $accepted->id)->value('final_category'))->toBe('lighting');
});

test('a review for an unknown report is a 404', function () {
    Sanctum::actingAs(srUser('staff'));

    test()->postJson('/api/staff/issue-reports/99999/review', srValidReview())->assertNotFound();
});

test('a review with bad values is rejected', function () {
    $report = srItem('needs_review');
    Sanctum::actingAs(srUser('staff'));
    $url = "/api/staff/issue-reports/{$report->id}/review";

    test()->postJson($url, srValidReview(['category' => 'aliens']))->assertStatus(422);
    test()->postJson($url, srValidReview(['severity' => 'critical']))->assertStatus(422);
    test()->postJson($url, srValidReview(['summary' => 'no']))->assertStatus(422);

    expect(IssueReportAnalysis::where('issue_report_id', $report->id)->value('state'))->toBe('needs_review');
});