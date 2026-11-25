<?php

namespace App\Http\Controllers;

use App\Models\UserNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * The notification bell (frontend: NotificationBell.jsx in the student header).
 *
 *   GET  /api/notifications             latest 30 + unread count
 *   POST /api/notifications/{id}/read   mark one as read
 *   POST /api/notifications/read-all    mark all as read
 *
 * Uses our own `notifications` table (UserNotification), filled by the
 * waiting list (offers, no-shows) and the booking reminders.
 */
class NotificationController extends Controller
{
    private const TZ = 'Asia/Kuala_Lumpur';

    public const LIMIT = 30;

    /** Nicer titles than the raw message_type. */
    private const TITLES = [
        'waiting_list_offer' => 'A room is free for you',
        'waiting_list_offer_expired' => 'Room offer expired',
        'booking_no_show' => 'Booking released (no-show)',
        'booking_start_reminder' => 'Your booking starts soon',
        'booking_checkout_reminder' => 'Time to check out soon',
    ];

    /** Where the "action" button in the bell takes the student. */
    private const ACTIONS = [
        'waiting_list_offer' => ['label' => 'Accept the room', 'page' => 'waiting-list'],
        'waiting_list_offer_expired' => ['label' => 'Waiting list', 'page' => 'waiting-list'],
        'booking_no_show' => ['label' => 'Book again', 'page' => 'rooms'],
        'booking_start_reminder' => ['label' => 'Show my QR', 'page' => 'dashboard'],
        'booking_checkout_reminder' => ['label' => 'Extend or check out', 'page' => 'dashboard'],
    ];

    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $notifications = $this->visible($userId)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::LIMIT)
            ->get();

        return response()->json([
            'unread' => $this->visible($userId)->where('is_read', false)->count(),
            'notifications' => $notifications->map(fn (UserNotification $n) => $this->payload($n))->values(),
        ]);
    }

    public function read(Request $request, UserNotification $notification): JsonResponse
    {
        if ((int) $notification->user_id !== (int) $request->user()->id) {
            return response()->json(['message' => 'This notification is not yours.'], 403);
        }

        if (! $notification->is_read) {
            $notification->is_read = true;
            $notification->save();
        }

        return response()->json([
            'notification' => $this->payload($notification),
            'unread' => $this->visible($request->user()->id)->where('is_read', false)->count(),
        ]);
    }

    public function readAll(Request $request): JsonResponse
    {
        $marked = $this->visible($request->user()->id)->where('is_read', false)->update(['is_read' => true]);

        return response()->json(['marked' => $marked, 'unread' => 0]);
    }

    /* ------------------------------------------------------------------ */

    /** The student's notifications that are due (reminders can be scheduled for later). */
    private function visible(int $userId)
    {
        return UserNotification::where('user_id', $userId)
            ->where(fn ($q) => $q->whereNull('scheduled_at')->orWhere('scheduled_at', '<=', Carbon::now()));
    }

    private function payload(UserNotification $n): array
    {
        $type = (string) $n->message_type;

        return [
            'id' => $n->id,
            'type' => $type,
            'title' => self::TITLES[$type] ?? Str::headline($type),
            'text' => $n->message,
            'read' => (bool) $n->is_read,
            'urgent' => $type === 'waiting_list_offer',
            'action' => self::ACTIONS[$type] ?? null,
            'created_at' => $n->created_at?->copy()->setTimezone(self::TZ)->toIso8601String(),
        ];
    }
}