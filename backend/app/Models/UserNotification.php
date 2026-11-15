<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A message for a student (reminders, waiting-list updates...).
 * Matches our own `notifications` table in database/database.sql,
 * which is NOT Laravel's built-in notifications format.
 */
class UserNotification extends Model
{
    protected $table = 'notifications';

    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'message_type', 'message', 'scheduled_at', 'delivered_at', 'is_read', 'status',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'is_read' => 'boolean',
            'scheduled_at' => 'datetime',
            'delivered_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
