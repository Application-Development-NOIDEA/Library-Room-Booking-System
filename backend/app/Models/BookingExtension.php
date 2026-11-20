<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A student's request to make a booking longer.
 * Matches the `booking_extensions` table in database/database.sql.
 */
class BookingExtension extends Model
{
    protected $table = 'booking_extensions';

    public $timestamps = false;

    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = ['booking_id', 'requested_end_at', 'status', 'requested_at'];

    protected function casts(): array
    {
        return [
            'booking_id' => 'integer',
            'requested_end_at' => 'datetime',
            'requested_at' => 'datetime',
        ];
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }
}