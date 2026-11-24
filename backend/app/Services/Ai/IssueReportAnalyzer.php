<?php

namespace App\Services\Ai;

use App\Models\IssueReport;
use App\Models\IssueReportAnalysis;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Asks the AI about a report and decides: accept the answer, or send it to staff.
 * Never throws because of the AI, and never analyses the same report twice.
 */
class IssueReportAnalyzer
{
    public function __construct(
        private readonly AiClient $client,
        private readonly AiOutputValidator $validator,
    ) {}

    public function analyze(IssueReport $report): IssueReportAnalysis
    {
        $existing = IssueReportAnalysis::where('issue_report_id', $report->id)->first();
        if ($existing) {
            return $existing;
        }

        $outcome = $this->evaluate($report);

        try {
            $analysis = IssueReportAnalysis::create(['issue_report_id' => $report->id] + $outcome);
        } catch (QueryException $e) {
            // Another run saved it first (one row per report is enforced by the database).
            $existing = IssueReportAnalysis::where('issue_report_id', $report->id)->first();
            if ($existing) {
                return $existing;
            }
            throw $e;
        }

        if ($analysis->state === IssueReportAnalysis::STATE_NEEDS_REVIEW) {
            Log::warning('Issue report sent to staff review', [
                'issue_report_id' => $report->id,
                'reason' => $analysis->review_reason,
            ]);
        }

        return $analysis;
    }

    private function evaluate(IssueReport $report): array
    {
        try {
            $raw = $this->client->analyze($report);
        } catch (Throwable $e) {
            Log::warning('AI could not analyse an issue report', [
                'issue_report_id' => $report->id,
                'error' => $e->getMessage(),
            ]);

            return $this->needsReview(IssueReportAnalysis::REASON_AI_ERROR);
        }

        $check = $this->validator->validate($raw);

        if (! $check['ok']) {
            Log::warning('AI gave an invalid answer for an issue report', [
                'issue_report_id' => $report->id,
                'problem' => $check['error'],
            ]);

            return $this->needsReview(IssueReportAnalysis::REASON_INVALID_OUTPUT, [
                'ai_raw_output' => Str::limit($raw, 2000, ''),
            ]);
        }

        $data = $check['data'];
        $ai = [
            'ai_category' => $data['category'],
            'ai_severity' => $data['severity'],
            'ai_summary' => $data['summary'],
            'ai_confidence' => $data['confidence'],
            'ai_raw_output' => Str::limit($raw, 2000, ''),
        ];

        // Exactly at the threshold is accepted.
        if ($data['confidence'] < (float) config('services.ai.min_confidence', 0.7)) {
            return $this->needsReview(IssueReportAnalysis::REASON_LOW_CONFIDENCE, $ai);
        }

        return $ai + [
            'state' => IssueReportAnalysis::STATE_AUTO_ACCEPTED,
            'final_category' => $data['category'],
            'final_severity' => $data['severity'],
            'final_summary' => $data['summary'],
        ];
    }

    private function needsReview(string $reason, array $ai = []): array
    {
        return $ai + [
            'state' => IssueReportAnalysis::STATE_NEEDS_REVIEW,
            'review_reason' => $reason,
        ];
    }
}