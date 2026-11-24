<?php

namespace App\Jobs;

use App\Models\IssueReport;
use App\Services\Ai\IssueReportAnalyzer;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Log;
use Throwable;

/** Runs right after the response is sent (no queue worker needed). */
class AnalyzeIssueReport
{
    use Dispatchable;

    public function __construct(public int $issueReportId) {}

    public function handle(IssueReportAnalyzer $analyzer): void
    {
        try {
            $report = IssueReport::find($this->issueReportId);
            if ($report) {
                $analyzer->analyze($report);
            }
        } catch (Throwable $e) {
            // The sweeper (issue-reports:analyze-pending) will pick it up again.
            Log::error('Could not analyse an issue report', [
                'issue_report_id' => $this->issueReportId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}