<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Room;
use App\Models\WaitingList;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Data for the student dashboard page (StudentDashboard.jsx).
 *
 * GET /api/student/dashboard
 *
 * Every key in the response has the same shape as the matching sample
 * constant in StudentDashboard.jsx, so the frontend can swap them 1:1:
 *
 *   bookings      -> sampleBookings
 *   waiting       -> sampleWaiting (null when not in any queue)
 *   availability  -> sampleAvailability
 *   notifications -> sampleNotifications
 *   rules         -> rules
 */
class StudentDashboardController extends Controller
{
    /** Minutes a student has to check in before the booking is released. */
    private const CHECK_IN_GRACE_MINUTES = 15;

    private const NOTIFICATION_LIMIT = 5;

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $now = now();

        return response()->json([
            'user' => ['name' => $user->name],
            'server_time' => $now->toIso8601String(),
            'bookings' => $this->upcomingBookings($user->id, $now),
            'waiting' => $this->waitingPosition($user->id),
            'availability' => $this->availability($now),
            'notifications' => $this->notifications($user),
            'rules' => $this->rules(),
        ]);
    }

    /** The student's bookings that have not ended yet, soonest first. */
    private function upcomingBookings(int $userId, $now): array
    {
        return Booking::with('room:id,name,type')
            ->where('user_id', $userId)
            ->whereIn('status', Booking::ACTIVE_STATUSES)
            ->where('end_time', '>', $now)
            ->orderBy('start_time')
            ->get()
            ->map(fn (Booking $booking) => [
                'id' => $booking->reference,
                'room' => $booking->room->name,
                'type' => strtoupper($booking->room->type) . ' ROOM',
                'start' => $booking->start_time->toIso8601String(),
                'end' => $booking->end_time->toIso8601String(),
                'status' => $booking->status,
            ])
            ->all();
    }

    /**
     * The student's best (lowest) queue position, or null if not queued.
     * Position = people who joined the same room's queue earlier + 1.
     */
    private function waitingPosition(int $userId): ?array
    {
        $entries = WaitingList::with('room:id,name')
            ->where('user_id', $userId)
            ->where('status', WaitingList::STATUS_WAITING)
            ->get();

        $best = null;

        foreach ($entries as $entry) {
            $ahead = WaitingList::where('room_id', $entry->room_id)
                ->where('status', WaitingList::STATUS_WAITING)
                ->where(function ($query) use ($entry) {
                    $query->where('created_at', '<', $entry->created_at)
                        ->orWhere(function ($tie) use ($entry) {
                            $tie->where('created_at', $entry->created_at)
                                ->where('id', '<', $entry->id);
                        });
                })
                ->count();

            if ($best === null || $ahead + 1 < $best['position']) {
                $best = ['room' => $entry->room->name, 'position' => $ahead + 1];
            }
        }

        return $best;
    }

    /** Free / total rooms per type right now. */
    private function availability($now): array
    {
        $occupiedRoomIds = Booking::whereIn('status', Booking::ACTIVE_STATUSES)
            ->where('start_time', '<=', $now)
            ->where('end_time', '>', $now)
            ->pluck('room_id')
            ->unique();

        $rooms = Room::where('is_active', true)->get(['id', 'type'])->groupBy('type');

        return collect(Room::TYPES)
            ->map(function (string $type) use ($rooms, $occupiedRoomIds) {
                $ofType = $rooms->get($type, collect());

                return [
                    'type' => ucfirst($type),
                    'free' => $ofType->whereNotIn('id', $occupiedRoomIds)->count(),
                    'total' => $ofType->count(),
                ];
            })
            ->all();
    }

    /**
     * Latest notifications from Laravel's built-in notifications table.
     * Each notification's data array should hold: title, text, tone.
     */
    private function notifications($user): array
    {
        return $user->notifications()
            ->latest()
            ->limit(self::NOTIFICATION_LIMIT)
            ->get()
            ->map(fn ($notification) => [
                'id' => $notification->id,
                'tone' => $notification->data['tone'] ?? 'muted',
                'title' => $notification->data['title'] ?? 'Notification',
                'text' => $notification->data['text'] ?? '',
                'read' => $notification->read_at !== null,
                'created_at' => $notification->created_at->toIso8601String(),
            ])
            ->all();
    }

    private function rules(): array
    {
        $minutes = self::CHECK_IN_GRACE_MINUTES;

        return [
            "Check in at the counter within {$minutes} minutes of your start time, or the booking is cancelled.",
            'Show your QR code to collect the room key, and return it when you check out.',
            'Extensions are allowed only if nobody has booked the next slot.',
        ];
    }
}