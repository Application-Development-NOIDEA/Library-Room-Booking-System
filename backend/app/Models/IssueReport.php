<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A problem a student reported in a room they booked.
 * Matches the `issue_reports` table in database/database.sql.
 */
class IssueReport extends Model
{
    protected $table = 'issue_reports';

    public const UPDATED_AT = null;

    public const STATUS_SUBMITTED = 'submitted';
    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_RESOLVED = 'resolved';

    /** Same ids as ISSUE_CATEGORIES in frontend/src/student/reportService.js */
    public const CATEGORIES = [
        'lighting', 'air_conditioning', 'furniture', 'power',
        'display', 'wifi', 'cleanliness', 'other',
    ];

    protected $fillable = [
        'booking_id', 'user_id', 'room_id', 'issue_category', 'description', 'image_path', 'status',
    ];

    protected function casts(): array
    {
        return [
            'booking_id' => 'integer',
            'user_id' => 'integer',
            'room_id' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function analysis(): HasOne
    {
        return $this->hasOne(IssueReportAnalysis::class);
    }
}