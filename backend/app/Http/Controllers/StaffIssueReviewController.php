<?php

namespace App\Http\Controllers;

use App\Models\IssueReport;
use App\Models\IssueReportAnalysis;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 *   GET  /api/staff/issue-reports/review          reports the AI could not handle, oldest first
 *   POST /api/staff/issue-reports/{report}/review staff decide the category, severity and summary
 */
class StaffIssueReviewController extends Controller
{
    private const TZ = 'Asia/Kuala_Lumpur';

    public function index(): JsonResponse
    {
        $query = IssueReportAnalysis::where('state', IssueReportAnalysis::STATE_NEEDS_REVIEW);
        $total = (clone $query)->count();

        $items = $query
            ->with(['report.room:id,room_name', 'report.user:id,name'])
            ->orderBy('created_at')
            ->orderBy('id')
            ->limit(100)
            ->get();

        return response()->json([
            'pending_count' => $total,
            'items' => $items->map(fn (IssueReportAnalysis $analysis) => $this->payload($analysis))->values(),
        ]);
    }

    public function review(Request $request, int $report): JsonResponse
    {
        $data = $request->validate([
            'category' => ['required', Rule::in(IssueReport::CATEGORIES)],
            'severity' => ['required', Rule::in(IssueReportAnalysis::SEVERITIES)],
            'summary' => ['required', 'string', 'min:5', 'max:300'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $result = DB::transaction(function () use ($report, $data, $request) {
            $analysis = IssueReportAnalysis::where('issue_report_id', $report)->lockForUpdate()->first();

            if (! $analysis) {
                return null;
            }

            // Only reports waiting for review can be reviewed, and only once.
            if ($analysis->state !== IssueReportAnalysis::STATE_NEEDS_REVIEW) {
                return false;
            }

            $analysis->fill([
                'state' => IssueReportAnalysis::STATE_STAFF_REVIEWED,
                'final_category' => $data['category'],
                'final_severity' => $data['severity'],
                'final_summary' => trim($data['summary']),
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'review_note' => isset($data['note']) ? trim($data['note']) : null,
            ])->save();

            return $analysis;
        });

        if ($result === null) {
            return response()->json(['message' => 'No analysis found for this report yet.'], 404);
        }

        if ($result === false) {
            return response()->json(['message' => 'This report is not waiting for review.'], 409);
        }

        return response()->json([
            'review' => [
                'report_id' => $result->issue_report_id,
                'state' => $result->state,
                'category' => $result->final_category,
                'severity' => $result->final_severity,
                'summary' => $result->final_summary,
            ],
        ]);
    }

    private function payload(IssueReportAnalysis $analysis): array
    {
        $report = $analysis->report;

        return [
            'report_id' => $report->id,
            'reference' => 'RPT-'.str_pad((string) $report->id, 4, '0', STR_PAD_LEFT),
            'room_name' => $report->room?->room_name,
            'student_name' => $report->user?->name,
            'student_category' => $report->issue_category,
            'description' => $report->description,
            'image_url' => $report->image_path ? Storage::disk('public')->url($report->image_path) : null,
            'reason' => $analysis->review_reason,
            'ai_suggestion' => $analysis->ai_category === null ? null : [
                'category' => $analysis->ai_category,
                'severity' => $analysis->ai_severity,
                'summary' => $analysis->ai_summary,
                'confidence' => $analysis->ai_confidence,
            ],
            'submitted_at' => $report->created_at?->copy()->setTimezone(self::TZ)->toIso8601String(),
        ];
    }
}