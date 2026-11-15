<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A room booking. Matches the `bookings` table in database/database.sql
 * (start_at / end_at, created_at only).
 */
class Booking extends Model
{
    public const UPDATED_AT = null;

    public const STATUS_HELD = 'held';
    public const STATUS_CONFIRMED = 'confirmed';
    public const STATUS_CHECKED_IN = 'checked_in';
    public const STATUS_CHECKED_OUT = 'checked_out';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_NO_SHOW = 'no_show';

    /** Statuses that still hold the room (block other bookings for that time). */
    public const ACTIVE_STATUSES = [self::STATUS_HELD, self::STATUS_CONFIRMED, self::STATUS_CHECKED_IN];

    protected $fillable = [
        'user_id', 'room_id', 'start_at', 'end_at', 'status', 'qr_token_hash',
    ];

    protected $hidden = ['qr_token_hash'];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'room_id' => 'integer',
            'start_at' => 'datetime',
            'end_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    /** Reference shown to students, e.g. BK-0012. */
    public function getReferenceAttribute(): string
    {
        return 'BK-'.str_pad((string) $this->id, 4, '0', STR_PAD_LEFT);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    /** Bookings that are still holding their room. */
    public function scopeActive(Builder $query): void
    {
        $query->whereIn('status', self::ACTIVE_STATUSES);
    }

    /** Bookings whose time overlaps [$start, $end). */
    public function scopeOverlapping(Builder $query, $start, $end): void
    {
        $query->where('start_at', '<', $end)->where('end_at', '>', $start);
    }
}
