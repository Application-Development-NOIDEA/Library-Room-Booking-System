<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Room;
use App\Models\UserNotification;
use App\Models\WaitingList;
use App\Services\WaitingListService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Data for the student dashboard page (StudentDashboard.jsx).
 *
 * GET /api/student/dashboard
 *
 * Uses the real tables from database/database.sql
 * (bookings.start_at/end_at, rooms.room_name/room_type/status,
 *  waiting_list_entries, notifications).
 */
class StudentDashboardController extends Controller
{
    /** Booking times are shown in Malaysian time. */
    private const TZ = 'Asia/Kuala_Lumpur';

    /** Minutes a student has to check in before the booking is released. */
    private const CHECK_IN_GRACE_MINUTES = 15;

    private const NOTIFICATION_LIMIT = 5;

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $now = now();

        return response()->json([
            'user' => ['name' => $user->name],
            'server_time' => $now->copy()->setTimezone(self::TZ)->toIso8601String(),
            'bookings' => $this->upcomingBookings($user->id, $now),
            'waiting' => $this->waitingPosition($user->id),
            'availability' => $this->availability($now),
            'notifications' => $this->notifications($user->id),
            'rules' => $this->rules(),
        ]);
    }

    /** The student's bookings that have not ended yet, soonest first. */
    private function upcomingBookings(int $userId, Carbon $now): array
    {
        return Booking::with('room:id,room_name,room_type')
            ->where('user_id', $userId)
            ->active()
            ->where('end_at', '>', $now)
            ->orderBy('start_at')
            ->get()
            ->map(fn (Booking $booking) => [
                'id' => $booking->reference,
                'room' => $booking->room?->room_name,
                'type' => strtoupper(str_replace('_', ' ', (string) $booking->room?->room_type)).' ROOM',
                'start' => $booking->start_at->copy()->setTimezone(self::TZ)->toIso8601String(),
                'end' => $booking->end_at->copy()->setTimezone(self::TZ)->toIso8601String(),
                'status' => $booking->status,
            ])
            ->all();
    }

    /**
     * The student's best (lowest) queue position, or null if not queued.
     * Uses the same rules as the Waiting List page (WaitingListService).
     */
    private function waitingPosition(int $userId): ?array
    {
        $service = app(WaitingListService::class);

        $entries = WaitingList::with('room:id,room_name')
            ->where('user_id', $userId)
            ->active()
            ->get();

        $best = null;

        foreach ($entries as $entry) {
            $position = $entry->status === WaitingList::STATUS_OFFERED ? 1 : $service->position($entry);

            if ($best === null || $position < $best['position']) {
                $best = [
                    'room' => $entry->room?->room_name ?? $service->groupName($entry->room_type),
                    'position' => $position,
                ];
            }
        }

        return $best;
    }

    /** Free / total rooms right now, for each bookable room type. */
    private function availability(Carbon $now): array
    {
        $occupiedRoomIds = Booking::active()
            ->where('start_at', '<=', $now)
            ->where('end_at', '>', $now)
            ->pluck('room_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->all();

        $bookableTypes = collect(RoomController::GROUPS)->filter(fn ($group) => $group['bookable'])->keys();

        $rooms = Room::where('status', 'active')
            ->whereIn('room_type', $bookableTypes)
            ->get(['id', 'room_type'])
            ->groupBy('room_type');

        return $bookableTypes
            ->map(function (string $type) use ($rooms, $occupiedRoomIds) {
                $ofType = $rooms->get($type, collect());

                return [
                    'type' => Str::headline($type),
                    'free' => $ofType->reject(fn ($room) => in_array((int) $room->id, $occupiedRoomIds, true))->count(),
                    'total' => $ofType->count(),
                ];
            })
            ->values()
            ->all();
    }

    /** Latest messages from our notifications table. */
    private function notifications(int $userId): array
    {
        return UserNotification::where('user_id', $userId)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::NOTIFICATION_LIMIT)
            ->get()
            ->map(fn (UserNotification $notification) => [
                'id' => $notification->id,
                'tone' => $this->toneFor($notification->message_type),
                'title' => Str::headline($notification->message_type),
                'text' => $notification->message,
                'read' => (bool) $notification->is_read,
                'created_at' => $notification->created_at?->copy()->setTimezone(self::TZ)->toIso8601String(),
            ])
            ->all();
    }

    private function toneFor(string $type): string
    {
        return match (true) {
            str_contains($type, 'wait') || str_contains($type, 'offer') => 'maroon',
            str_contains($type, 'remind') => 'muted',
            default => 'gold',
        };
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