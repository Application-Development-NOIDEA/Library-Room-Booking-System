<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Room extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'room_code', 'room_name', 'room_type', 'capacity',
        'location', 'facilities', 'status',
    ];

    protected $casts = [
        'facilities' => 'array',
        'capacity' => 'integer',
    ];
}