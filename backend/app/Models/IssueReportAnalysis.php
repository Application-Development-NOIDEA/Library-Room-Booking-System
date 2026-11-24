<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** What the AI made of an issue report, and what staff decided if it needed review. */
class IssueReportAnalysis extends Model
{
    protected $table = 'issue_report_analyses';

    public const STATE_AUTO_ACCEPTED = 'auto_accepted';
    public const STATE_NEEDS_REVIEW = 'needs_review';
    public const STATE_STAFF_REVIEWED = 'staff_reviewed';

    public const REASON_AI_ERROR = 'ai_error';
    public const REASON_INVALID_OUTPUT = 'invalid_output';
    public const REASON_LOW_CONFIDENCE = 'low_confidence';

    public const SEVERITIES = ['low', 'medium', 'high'];

    protected $fillable = [
        'issue_report_id', 'state', 'review_reason',
        'ai_category', 'ai_severity', 'ai_summary', 'ai_confidence', 'ai_raw_output',
        'final_category', 'final_severity', 'final_summary',
        'reviewed_by', 'reviewed_at', 'review_note',
    ];

    protected function casts(): array
    {
        return [
            'issue_report_id' => 'integer',
            'reviewed_by' => 'integer',
            'ai_confidence' => 'float',
            'reviewed_at' => 'datetime',
        ];
    }

    public function report(): BelongsTo
    {
        return $this->belongsTo(IssueReport::class, 'issue_report_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}