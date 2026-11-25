<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Who checked a booking in and out, and when. Matches `booking_checkins`. */
class BookingCheckin extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'booking_id', 'checked_in_at', 'checked_in_by', 'checked_out_at', 'checked_out_by',
    ];

    protected function casts(): array
    {
        return [
            'booking_id' => 'integer',
            'checked_in_at' => 'datetime',
            'checked_out_at' => 'datetime',
        ];
    }
}