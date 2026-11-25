<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One AI-written summary of the issue reports in a period.
 * Matches the `ai_report_summaries` table in database/database.sql.
 *
 * issue_counts      {total, by_category, by_severity, by_status, by_room, source}
 * recurring_issues  [{room, category, count}]
 * suggested_actions ["..."]
 */
class AiReportSummary extends Model
{
    protected $table = 'ai_report_summaries';

    public $timestamps = false;

    public const SOURCE_AI = 'ai';
    public const SOURCE_FALLBACK = 'fallback';

    protected $fillable = [
        'period_start', 'period_end', 'summary_text',
        'issue_counts', 'recurring_issues', 'suggested_actions', 'generated_at',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'issue_counts' => 'array',
            'recurring_issues' => 'array',
            'suggested_actions' => 'array',
            'generated_at' => 'datetime',
        ];
    }
}