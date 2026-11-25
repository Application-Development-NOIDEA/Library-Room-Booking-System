<?php

namespace App\Http\Controllers;

use App\Models\AiReportSummary;
use App\Services\Ai\ReportSummarizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Staff "AI Report Analyzer" (period summaries).
 *
 *   GET  /api/staff/report-summaries   the 10 most recent summaries
 *   POST /api/staff/report-summaries   { from: "2026-11-01", to: "2026-11-25" } -> a new summary
 *
 * Works without an AI key too: the summary is then written from simple rules (source = "fallback").
 */
class StaffReportSummaryController extends Controller
{
    private const TZ = 'Asia/Kuala_Lumpur';

    public const MAX_DAYS = 92;

    public function index(): JsonResponse
    {
        $summaries = AiReportSummary::orderByDesc('generated_at')->orderByDesc('id')->limit(10)->get();

        return response()->json([
            'summaries' => $summaries->map(fn (AiReportSummary $s) => $this->payload($s))->values(),
        ]);
    }

    public function store(Request $request, ReportSummarizer $summarizer): JsonResponse
    {
        $today = Carbon::now(self::TZ)->toDateString();

        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from', 'before_or_equal:'.$today],
        ], [
            'to.after_or_equal' => 'The end date must be on or after the start date.',
            'to.before_or_equal' => 'The end date cannot be in the future.',
        ]);

        $days = (int) round(Carbon::parse($data['from'])->diffInDays(Carbon::parse($data['to']))) + 1;
        if ($days > self::MAX_DAYS) {
            return response()->json(['message' => 'Choose a period of '.self::MAX_DAYS.' days or less.'], 422);
        }

        $summary = $summarizer->generate($data['from'], $data['to']);

        return response()->json(['summary' => $this->payload($summary)], 201);
    }

    private function payload(AiReportSummary $s): array
    {
        $counts = $s->issue_counts ?? [];
        $label = fn (string $c) => $c === 'wifi' ? 'Wi-Fi' : Str::headline($c);

        return [
            'id' => $s->id,
            'period_start' => $s->period_start?->toDateString(),
            'period_end' => $s->period_end?->toDateString(),
            'source' => $counts['source'] ?? AiReportSummary::SOURCE_FALLBACK,
            'summary' => $s->summary_text,
            'total' => $counts['total'] ?? 0,
            'open' => $counts['open'] ?? 0,
            'unreviewed' => $counts['unreviewed'] ?? 0,
            'by_category' => collect($counts['by_category'] ?? [])
                ->map(fn ($c) => $c + ['label' => $label($c['category'])])->values(),
            'by_severity' => $counts['by_severity'] ?? [],
            'by_room' => $counts['by_room'] ?? [],
            'recurring' => collect($s->recurring_issues ?? [])
                ->map(fn ($r) => $r + ['label' => $label($r['category'])])->values(),
            'actions' => $s->suggested_actions ?? [],
            'generated_at' => $s->generated_at?->copy()->setTimezone(self::TZ)->toIso8601String(),
        ];
    }
}