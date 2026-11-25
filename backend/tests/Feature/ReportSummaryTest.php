<?php

use App\Models\AiReportSummary;
use App\Models\Booking;
use App\Models\IssueReport;
use App\Models\IssueReportAnalysis;
use App\Models\Room;
use App\Models\User;
use App\Services\Ai\SummaryAiClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

/* Clock: Wednesday 25 Nov 2026, 15:00 in Malaysia (= 07:00 UTC). */
beforeEach(function () {
    Carbon::setTestNow(Carbon::create(2026, 11, 25, 7, 0, 0, 'UTC'));

    Room::insert([
        ['room_code' => 'DISC-01', 'room_name' => 'Discussion Room 1', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
        ['room_code' => 'DISC-02', 'room_name' => 'Discussion Room 2', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
    ]);
});

afterEach(fn () => Carbon::setTestNow());

/** A fake AI for summaries: returns a fixed answer and counts the calls. */
class FakeSummaryClient implements SummaryAiClient
{
    public int $calls = 0;

    public ?string $lastPrompt = null;

    public function __construct(private string $answer) {}

    public function summarize(string $prompt): string
    {
        $this->calls++;
        $this->lastPrompt = $prompt;

        return $this->answer;
    }
}

function rsFakeAi(string $answer): FakeSummaryClient
{
    $fake = new FakeSummaryClient($answer);
    app()->instance(SummaryAiClient::class, $fake);

    return $fake;
}

function rsUser(string $role): User
{
    $user = User::create(['name' => ucfirst($role), 'email' => uniqid($role).'@utm.my', 'password' => 'Password123']);
    $user->role = $role;
    $user->save();

    return $user;
}

/** A report made at a Malaysian date/time, optionally with an AI analysis. */
function rsReport(string $roomCode, string $category, string $when, string $status = 'submitted', ?array $analysis = null): IssueReport
{
    $student = rsUser('student');
    $roomId = Room::where('room_code', $roomCode)->value('id');

    $booking = Booking::create([
        'user_id' => $student->id,
        'room_id' => $roomId,
        'start_at' => Carbon::parse($when, 'Asia/Kuala_Lumpur')->subHours(2)->utc(),
        'end_at' => Carbon::parse($when, 'Asia/Kuala_Lumpur')->subHour()->utc(),
        'status' => 'checked_out',
    ]);

    $report = new IssueReport([
        'booking_id' => $booking->id,
        'user_id' => $student->id,
        'room_id' => $roomId,
        'issue_category' => $category,
        'description' => "Problem with $category in $roomCode.",
        'status' => $status,
    ]);
    $report->created_at = Carbon::parse($when, 'Asia/Kuala_Lumpur')->utc();
    $report->save();

    if ($analysis) {
        IssueReportAnalysis::create(['issue_report_id' => $report->id] + $analysis);
    }

    return $report;
}

function rsGenerate(string $from = '2026-11-01', string $to = '2026-11-25')
{
    return test()->postJson('/api/staff/report-summaries', ['from' => $from, 'to' => $to]);
}

test('only staff can use the report analyzer', function () {
    test()->getJson('/api/staff/report-summaries')->assertUnauthorized();
    rsGenerate()->assertUnauthorized();

    Sanctum::actingAs(rsUser('student'));
    test()->getJson('/api/staff/report-summaries')->assertForbidden();
    rsGenerate()->assertForbidden();
});

test('without an AI, the summary is written from the counts', function () {
    rsReport('DISC-01', 'lighting', '2026-11-10 10:00');
    rsReport('DISC-01', 'lighting', '2026-11-12 10:00');
    rsReport('DISC-02', 'wifi', '2026-11-20 10:00', 'resolved');
    Sanctum::actingAs(rsUser('staff'));

    $response = rsGenerate()->assertCreated()
        ->assertJsonPath('summary.source', 'fallback')
        ->assertJsonPath('summary.total', 3)
        ->assertJsonPath('summary.open', 2)
        ->assertJsonPath('summary.by_category.0.category', 'lighting')
        ->assertJsonPath('summary.by_category.0.count', 2)
        ->assertJsonPath('summary.recurring.0.room', 'DISC-01')
        ->assertJsonPath('summary.recurring.0.label', 'Lighting')
        ->assertJsonPath('summary.recurring.0.count', 2);

    expect($response->json('summary.summary'))->toContain('3 issue reports');
    expect($response->json('summary.actions.0'))->toContain('DISC-01');
    expect(AiReportSummary::count())->toBe(1);
});

test('a valid AI answer is used as the summary', function () {
    rsReport('DISC-01', 'lighting', '2026-11-10 10:00');
    $fake = rsFakeAi(json_encode([
        'summary' => 'Lighting is the main problem this month, mostly in Discussion Room 1.',
        'suggested_actions' => ['Replace the ceiling lights in DISC-01.'],
    ]));
    Sanctum::actingAs(rsUser('staff'));

    rsGenerate()->assertCreated()
        ->assertJsonPath('summary.source', 'ai')
        ->assertJsonPath('summary.summary', 'Lighting is the main problem this month, mostly in Discussion Room 1.')
        ->assertJsonPath('summary.actions.0', 'Replace the ceiling lights in DISC-01.')
        ->assertJsonPath('summary.total', 1); // counts never come from the AI

    expect($fake->calls)->toBe(1);
    expect($fake->lastPrompt)->toContain('<reports>')->toContain('DISC-01');
});

test('a bad AI answer falls back to the rule-based summary', function () {
    rsReport('DISC-01', 'lighting', '2026-11-10 10:00');
    rsFakeAi('Sure! Here is your summary: lights are broken.');
    Sanctum::actingAs(rsUser('staff'));

    rsGenerate()->assertCreated()->assertJsonPath('summary.source', 'fallback');

    rsFakeAi(json_encode(['summary' => 'Too short', 'suggested_actions' => ['Fix it']]));
    rsGenerate()->assertCreated()->assertJsonPath('summary.source', 'fallback');
});

test('reviewed categories are trusted, reports still under review use the student category', function () {
    rsReport('DISC-01', 'other', '2026-11-10 10:00', 'submitted', [
        'state' => 'staff_reviewed', 'final_category' => 'power', 'final_severity' => 'high', 'final_summary' => 'Socket has no power.',
    ]);
    rsReport('DISC-01', 'furniture', '2026-11-11 10:00', 'submitted', [
        'state' => 'needs_review', 'review_reason' => 'low_confidence', 'ai_category' => 'power', 'ai_severity' => 'low', 'ai_confidence' => 0.4,
    ]);
    Sanctum::actingAs(rsUser('staff'));

    $summary = rsGenerate()->assertCreated()->json('summary');

    expect(collect($summary['by_category'])->pluck('count', 'category')->all())
        ->toEqual(['power' => 1, 'furniture' => 1]);
    expect(collect($summary['by_severity'])->pluck('count', 'severity')->all())
        ->toEqual(['low' => 0, 'medium' => 0, 'high' => 1]);
    expect($summary['unreviewed'])->toBe(1);
});

test('only reports inside the period are counted, and an empty period skips the AI', function () {
    rsReport('DISC-01', 'lighting', '2026-10-31 23:30'); // just before 1 Nov in Malaysia
    rsReport('DISC-01', 'lighting', '2026-11-01 00:30'); // just after
    $fake = rsFakeAi('{}');
    Sanctum::actingAs(rsUser('staff'));

    rsGenerate('2026-11-01', '2026-11-25')->assertJsonPath('summary.total', 1);

    $fake->calls = 0;
    rsGenerate('2026-11-20', '2026-11-25')
        ->assertJsonPath('summary.total', 0)
        ->assertJsonPath('summary.summary', 'No issue reports were submitted between 20 Nov 2026 and 25 Nov 2026.');
    expect($fake->calls)->toBe(0);
});

test('bad periods are rejected', function () {
    Sanctum::actingAs(rsUser('staff'));

    rsGenerate('2026-11-20', '2026-11-10')->assertStatus(422)
        ->assertJsonPath('message', 'The end date must be on or after the start date.');
    rsGenerate('2026-11-20', '2026-11-30')->assertStatus(422)
        ->assertJsonPath('message', 'The end date cannot be in the future.');
    rsGenerate('2026-01-01', '2026-11-25')->assertStatus(422)
        ->assertJsonPath('message', 'Choose a period of 92 days or less.');

    expect(AiReportSummary::count())->toBe(0);
});

test('staff can see past summaries, newest first', function () {
    rsReport('DISC-01', 'lighting', '2026-11-10 10:00');
    Sanctum::actingAs(rsUser('staff'));

    rsGenerate('2026-11-01', '2026-11-15');
    Carbon::setTestNow(now()->addMinute());
    rsGenerate('2026-11-16', '2026-11-25');

    test()->getJson('/api/staff/report-summaries')->assertOk()
        ->assertJsonCount(2, 'summaries')
        ->assertJsonPath('summaries.0.period_start', '2026-11-16')
        ->assertJsonPath('summaries.1.period_start', '2026-11-01');
});