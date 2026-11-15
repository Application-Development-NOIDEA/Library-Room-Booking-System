<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A student's place in a same-day queue.
 * Matches the `waiting_list_entries` table in database/database.sql.
 */
class WaitingList extends Model
{
    protected $table = 'waiting_list_entries';

    public $timestamps = false;

    public const STATUS_WAITING = 'waiting';
    public const STATUS_OFFERED = 'offered';
    public const STATUS_FULFILLED = 'fulfilled';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_EXPIRED = 'expired';

    /** Entries still in the line (waiting, or holding an offer). */
    public const ACTIVE_STATUSES = [self::STATUS_WAITING, self::STATUS_OFFERED];

    protected $fillable = [
        'user_id', 'room_type', 'room_id', 'wanted_start', 'wanted_end',
        'party_size', 'joined_at', 'status',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'room_id' => 'integer',
            'party_size' => 'integer',
            'wanted_start' => 'datetime',
            'wanted_end' => 'datetime',
            'joined_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    public function scopeActive(Builder $query): void
    {
        $query->whereIn('status', self::ACTIVE_STATUSES);
    }
}
