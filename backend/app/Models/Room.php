<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Room extends Model
{
    /** Order here is the order shown on the dashboard. */
    public const TYPES = ['carrel', 'discussion', 'meeting'];

    protected $fillable = ['name', 'type', 'capacity', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }
}