<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A room offered to the student at the front of a waiting list.
 * The room is reserved for them as a "held" booking until expires_at.
 * Matches the `waiting_list_offers` table in database/database.sql.
 */
class WaitingListOffer extends Model
{
    protected $table = 'waiting_list_offers';

    public $timestamps = false;

    public const STATUS_PENDING = 'pending';
    public const STATUS_ACCEPTED = 'accepted';
    public const STATUS_DECLINED = 'declined';
    public const STATUS_EXPIRED = 'expired';

    protected $fillable = ['waiting_list_entry_id', 'booking_id', 'offered_at', 'expires_at', 'status'];

    protected function casts(): array
    {
        return [
            'waiting_list_entry_id' => 'integer',
            'booking_id' => 'integer',
            'offered_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    public function entry(): BelongsTo
    {
        return $this->belongsTo(WaitingList::class, 'waiting_list_entry_id');
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }
}