<?php

use App\Models\Booking;
use App\Models\IssueReport;
use App\Models\IssueReportAnalysis;
use App\Models\Room;
use App\Models\User;
use App\Services\Ai\AiClient;
use App\Services\Ai\AiOutputValidator;
use App\Services\Ai\IssueReportAnalyzer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow(Carbon::create(2026, 11, 16, 7, 0, 0, 'UTC'));
    config(['services.ai.min_confidence' => 0.7]);
});

afterEach(fn () => Carbon::setTestNow());

/** A fake AI: returns a fixed answer (or runs a closure) and counts how often it was asked. */
class FakeAiClient implements AiClient
{
    public int $calls = 0;

    public function __construct(private mixed $answer) {}

    public function analyze(IssueReport $report): string
    {
        $this->calls++;

        return $this->answer instanceof Closure ? ($this->answer)($report) : $this->answer;
    }
}

function aiAnswer(array $override = []): string
{
    return json_encode(array_merge([
        'category' => 'lighting',
        'severity' => 'medium',
        'summary' => 'Ceiling light flickers near the whiteboard.',
        'confidence' => 0.9,
    ], $override));
}

function anBooking(): Booking
{
    if (! Room::exists()) {
        Room::insert([['room_code' => 'DISC-01', 'room_name' => 'Discussion Room 1', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active']]);
    }

    $user = User::create(['name' => 'Aina', 'email' => uniqid('aina').'@graduate.utm.my', 'password' => 'Password123']);
    $user->role = 'student';
    $user->save();

    return Booking::create([
        'user_id' => $user->id,
        'room_id' => Room::value('id'),
        'start_at' => Carbon::create(2026, 11, 14, 2, 0, 0, 'UTC'),
        'end_at' => Carbon::create(2026, 11, 14, 4, 0, 0, 'UTC'),
        'status' => 'checked_out',
    ]);
}

function anReport(): IssueReport
{
    $booking = anBooking();

    return IssueReport::create([
        'booking_id' => $booking->id,
        'user_id' => $booking->user_id,
        'room_id' => $booking->room_id,
        'issue_category' => 'lighting',
        'description' => 'The ceiling light keeps flickering.',
        'status' => 'submitted',
    ]);
}

function anAnalyzer(AiClient $client): IssueReportAnalyzer
{
    return new IssueReportAnalyzer($client, new AiOutputValidator());
}

test('a confident, valid answer is accepted automatically', function () {
    $report = anReport();

    $analysis = anAnalyzer(new FakeAiClient(aiAnswer()))->analyze($report);

    expect($analysis->state)->toBe('auto_accepted');
    expect($analysis->review_reason)->toBeNull();
    expect($analysis->final_category)->toBe('lighting');
    expect($analysis->final_severity)->toBe('medium');
    expect($analysis->final_summary)->toBe('Ceiling light flickers near the whiteboard.');
    expect($analysis->ai_confidence)->toBe(0.9);
});

test('a low-confidence answer goes to staff review but keeps the AI suggestion', function () {
    $analysis = anAnalyzer(new FakeAiClient(aiAnswer(['confidence' => 0.4])))->analyze(anReport());

    expect($analysis->state)->toBe('needs_review');
    expect($analysis->review_reason)->toBe('low_confidence');
    expect($analysis->ai_category)->toBe('lighting');
    expect($analysis->final_category)->toBeNull();
});

test('confidence exactly at the threshold is accepted', function () {
    $analysis = anAnalyzer(new FakeAiClient(aiAnswer(['confidence' => 0.7])))->analyze(anReport());

    expect($analysis->state)->toBe('auto_accepted');
});

test('an invalid answer goes to staff review', function () {
    $analysis = anAnalyzer(new FakeAiClient('Sorry, I cannot help with that.'))->analyze(anReport());

    expect($analysis->state)->toBe('needs_review');
    expect($analysis->review_reason)->toBe('invalid_output');
    expect($analysis->ai_category)->toBeNull();
    expect($analysis->ai_raw_output)->toBe('Sorry, I cannot help with that.');
});

test('an AI failure goes to staff review and does not throw', function () {
    $client = new FakeAiClient(fn () => throw new RuntimeException('AI service is down'));

    $analysis = anAnalyzer($client)->analyze(anReport());

    expect($analysis->state)->toBe('needs_review');
    expect($analysis->review_reason)->toBe('ai_error');
});

test('a report is analysed only once', function () {
    $report = anReport();
    $client = new FakeAiClient(aiAnswer());
    $analyzer = anAnalyzer($client);

    $first = $analyzer->analyze($report);
    $second = $analyzer->analyze($report);

    expect($second->id)->toBe($first->id);
    expect($client->calls)->toBe(1);
    expect(IssueReportAnalysis::count())->toBe(1);
});

test('submitting a report always saves it, even when no AI is available', function () {
    $booking = anBooking();
    Sanctum::actingAs(User::find($booking->user_id));

    test()->postJson('/api/reports', [
        'booking_id' => $booking->id,
        'issue_category' => 'lighting',
        'description' => 'The ceiling light keeps flickering.',
    ])->assertCreated();

    expect(IssueReport::count())->toBe(1);

    $analysis = IssueReportAnalysis::first();
    expect($analysis->state)->toBe('needs_review');
    expect($analysis->review_reason)->toBe('ai_error');
});

test('the sweeper analyses missed reports but leaves brand-new ones alone', function () {
    app()->instance(AiClient::class, new FakeAiClient(aiAnswer()));
    $report = anReport();

    Carbon::setTestNow(Carbon::create(2026, 11, 16, 7, 1, 0, 'UTC'));
    test()->artisan('issue-reports:analyze-pending')->assertSuccessful();
    expect(IssueReportAnalysis::count())->toBe(0);

    Carbon::setTestNow(Carbon::create(2026, 11, 16, 7, 10, 0, 'UTC'));
    test()->artisan('issue-reports:analyze-pending')->assertSuccessful();
    expect(IssueReportAnalysis::where('issue_report_id', $report->id)->value('state'))->toBe('auto_accepted');
});