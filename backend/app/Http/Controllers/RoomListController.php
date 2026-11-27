<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Room;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

/**
 * Browse Rooms: every room of one type and whether it is free right now.
 *
 *   GET /api/room-list/{type}   e.g. /api/room-list/carrel
 *
 * status: "free" | "in_use" | "closed" (room under maintenance)
 * Only times are shown, never who booked the room.
 */
class RoomListController extends Controller
{
    private const TZ = 'Asia/Kuala_Lumpur';

    public function __invoke(string $type): JsonResponse
    {
        if (! array_key_exists($type, RoomController::GROUPS)) {
            return response()->json(['message' => 'Unknown room type.'], 404);
        }

        $now = Carbon::now();
        $endOfToday = Carbon::now(self::TZ)->endOfDay();

        $rooms = Room::where('room_type', $type)->orderBy('room_code')->get();

        // Active bookings from now until the end of today, per room
        $bookings = Booking::active()
            ->whereIn('room_id', $rooms->pluck('id'))
            ->where('end_at', '>', $now)
            ->where('start_at', '<', $endOfToday->copy()->utc())
            ->orderBy('start_at')
            ->get(['room_id', 'start_at', 'end_at'])
            ->groupBy('room_id');

        $list = $rooms->map(function (Room $room) use ($bookings, $now) {
            $mine = $bookings->get($room->id, collect());
            $current = $mine->first(fn ($b) => $b->start_at->lessThanOrEqualTo($now));
            $next = $mine->first(fn ($b) => $b->start_at->greaterThan($now));

            $status = match (true) {
                $room->status !== 'active' => 'closed',
                $current !== null => 'in_use',
                default => 'free',
            };

            return [
                'id' => $room->id,
                'room_code' => $room->room_code,
                'room_name' => $room->room_name,
                'capacity' => $room->capacity,
                'location' => $room->location,
                'facilities' => $room->facilities ?? [],
                'status' => $status,
                'free_at' => $current ? $this->time($current->end_at) : null,
                'next_booking_at' => $status === 'free' && $next ? $this->time($next->start_at) : null,
            ];
        })->values();

        return response()->json([
            'type' => $type,
            'free' => $list->where('status', 'free')->count(),
            'total' => $list->count(),
            'rooms' => $list,
        ]);
    }

    private function time(Carbon $time): string
    {
        return $time->copy()->setTimezone(self::TZ)->format('g:i A');
    }
}