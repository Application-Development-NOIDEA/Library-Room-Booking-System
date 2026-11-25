<?php

namespace App\Services;

use App\Models\IssueReport;
use App\Models\IssueReportAnalysis;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Known problems in rooms right now, from students' issue reports.
 *
 * "Open"      = not resolved yet, reported in the last WINDOW_DAYS days.
 * "Recurring" = the same problem in the same room at least RECURRING_MIN times.
 * "Urgent"    = the AI or staff rated it high severity.
 *
 * Used by Browse Rooms (warning on each room card) and by booking
 * (prefer a free room without urgent or recurring problems).
 */
class RoomProblems
{
    public const WINDOW_DAYS = 14;
    public const RECURRING_MIN = 2;

    /** @return array<string, array> problems grouped by room_type, most serious first */
    public function byRoomType(): array
    {
        return $this->problems()
            ->groupBy('room_type')
            ->map(fn (Collection $items) => $items
                ->sortBy([['urgent', 'desc'], ['count', 'desc'], ['last_reported', 'desc']])
                ->map(fn ($p) => collect($p)->except('room_id', 'room_type')->all())
                ->values()
                ->all())
            ->all();
    }

    /**
     * Rooms (of these ids) that have an urgent or recurring open problem.
     *
     * @param  array<int>  $roomIds
     * @return array<int>
     */
    public function roomsToAvoid(array $roomIds): array
    {
        return $this->problems($roomIds)
            ->filter(fn ($p) => $p['urgent'] || $p['recurring'])
            ->pluck('room_id')
            ->unique()
            ->values()
            ->all();
    }

    /* ------------------------------------------------------------------ */

    private function problems(?array $roomIds = null): Collection
    {
        $reports = IssueReport::with(['room:id,room_code,room_name,room_type', 'analysis'])
            ->where('status', '!=', IssueReport::STATUS_RESOLVED)
            ->where('created_at', '>=', Carbon::now()->subDays(self::WINDOW_DAYS))
            ->when($roomIds !== null, fn ($q) => $q->whereIn('room_id', $roomIds))
            ->get()
            ->filter(fn (IssueReport $r) => $r->room !== null);

        return $reports
            ->groupBy(fn (IssueReport $r) => $r->room_id.'|'.$this->categoryOf($r))
            ->map(function (Collection $group) {
                /** @var IssueReport $first */
                $first = $group->first();
                $category = $this->categoryOf($first);
                $count = $group->count();

                return [
                    'room_id' => (int) $first->room_id,
                    'room_type' => $first->room->room_type,
                    'room_code' => $first->room->room_code,
                    'room_name' => $first->room->room_name,
                    'category' => $category,
                    'label' => $category === 'wifi' ? 'Wi-Fi' : Str::headline($category),
                    'count' => $count,
                    'recurring' => $count >= self::RECURRING_MIN,
                    'urgent' => $group->contains(fn ($r) => $this->severityOf($r) === 'high'),
                    'last_reported' => $group->max('created_at')?->copy()->setTimezone('Asia/Kuala_Lumpur')->toDateString(),
                ];
            })
            ->values();
    }

    /** The AI's or staff's category once accepted/reviewed, otherwise the student's. */
    private function categoryOf(IssueReport $report): string
    {
        $a = $report->analysis;
        if ($a && $a->state !== IssueReportAnalysis::STATE_NEEDS_REVIEW) {
            return $a->final_category ?? $a->ai_category ?? $report->issue_category;
        }

        return $report->issue_category;
    }

    private function severityOf(IssueReport $report): ?string
    {
        $a = $report->analysis;
        if ($a && $a->state !== IssueReportAnalysis::STATE_NEEDS_REVIEW) {
            return $a->final_severity ?? $a->ai_severity;
        }

        return null;
    }
}