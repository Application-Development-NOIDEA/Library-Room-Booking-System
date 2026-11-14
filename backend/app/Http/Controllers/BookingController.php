<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Room;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class BookingController extends Controller
{
    /** All booking times are entered and shown in Malaysian time. */
    private const TZ = 'Asia/Kuala_Lumpur';

    /**
     * Booking window. These are placeholder hours for the prototype;
     * change them to PSZ's real opening hours.
     */
    private const OPEN_HOUR = 8;
    private const CLOSE_HOUR = 22;

    private const MAX_DAYS_AHEAD = 14;
    private const MAX_UPCOMING_PER_STUDENT = 3;

    /** Carrels use fixed 4-hour blocks; every other bookable type uses hourly slots of 1 or 2 hours. */
    private const CARREL_BLOCKS = [8, 12, 16];

    /* ------------------------------------------------------------------
     | GET /api/rooms/{type}/availability?date=YYYY-MM-DD&duration=1
     * ------------------------------------------------------------------ */
    public function availability(Request $request, string $type): JsonResponse
    {
        $group = $this->bookableGroup($type);

        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'duration' => ['nullable', 'integer'],
        ]);

        $durations = $this->durationsFor($type);
        $duration = (int) ($data['duration'] ?? $durations[0]);
        if (! in_array($duration, $durations, true)) {
            return $this->fail("Choose a duration of ".implode(' or ', $durations)." hours.");
        }

        $day = Carbon::createFromFormat('Y-m-d', $data['date'], self::TZ)->startOfDay();
        if ($error = $this->checkDay($day)) {
            return $this->fail($error);
        }

        $roomIds = Room::where('room_type', $type)->where('status', 'active')->pluck('id');
        $now = Carbon::now(self::TZ);

        // All active bookings for this room type on this day (one query, filtered in PHP).
        $dayBookings = Booking::active()
            ->whereIn('room_id', $roomIds)
            ->overlapping($this->toDb($day), $this->toDb($day->copy()->endOfDay()))
            ->get(['room_id', 'start_at', 'end_at']);

        $mine = Booking::active()
            ->where('user_id', $request->user()->id)
            ->overlapping($this->toDb($day), $this->toDb($day->copy()->endOfDay()))
            ->get(['start_at', 'end_at']);

        $slots = [];
        foreach ($this->slotStarts($type, $duration) as $hour) {
            $start = $day->copy()->setTime($hour, 0);
            $end = $start->copy()->addHours($duration);

            $busy = $dayBookings
                ->filter(fn ($b) => $b->start_at < $end && $b->end_at > $start)
                ->pluck('room_id')
                ->unique()
                ->count();

            $youHaveBooking = $mine->contains(fn ($b) => $b->start_at < $end && $b->end_at > $start);
            $free = max(0, $roomIds->count() - $busy);
            $past = $start->lessThanOrEqualTo($now);

            $slots[] = [
                'start_time' => $start->format('H:i'),
                'end_time' => $end->format('H:i'),
                'start_at' => $start->toIso8601String(),
                'free' => $free,
                'total' => $roomIds->count(),
                'past' => $past,
                'you_have_booking' => $youHaveBooking,
                'available' => ! $past && $free > 0 && ! $youHaveBooking,
            ];
        }

        return response()->json([
            'room_type' => $type,
            'room_name' => $group['name'],
            'date' => $day->format('Y-m-d'),
            'duration' => $duration,
            'durations' => $durations,
            'slots' => $slots,
        ]);
    }

    /* ------------------------------------------------------------------
     | POST /api/bookings   { room_type, date, start_time, duration }
     * ------------------------------------------------------------------ */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'room_type' => ['required', 'string'],
            'date' => ['required', 'date_format:Y-m-d'],
            'start_time' => ['required', 'date_format:H:i'],
            'duration' => ['required', 'integer'],
        ]);

        $type = $data['room_type'];
        $group = $this->bookableGroup($type);
        $duration = (int) $data['duration'];
        $user = $request->user();

        $start = Carbon::createFromFormat('Y-m-d H:i', "{$data['date']} {$data['start_time']}", self::TZ);
        $end = $start->copy()->addHours($duration);

        if ($error = $this->checkDay($start->copy()->startOfDay())) {
            return $this->fail($error);
        }
        if (! in_array($duration, $this->durationsFor($type), true)
            || ! in_array((int) $start->format('G'), $this->slotStarts($type, $duration), true)
            || $start->minute !== 0) {
            return $this->fail('That time slot is not available for this room. Please pick one from the list.');
        }
        if ($start->lessThanOrEqualTo(Carbon::now(self::TZ))) {
            return $this->fail('That time has already started. Please choose a later slot.');
        }

        $ownOverlap = Booking::active()
            ->where('user_id', $user->id)
            ->overlapping($this->toDb($start), $this->toDb($end))
            ->exists();
        if ($ownOverlap) {
            return $this->fail('You already have a booking at that time.');
        }

        $upcoming = Booking::active()
            ->where('user_id', $user->id)
            ->where('end_at', '>', $this->toDb(Carbon::now(self::TZ)))
            ->count();
        if ($upcoming >= self::MAX_UPCOMING_PER_STUDENT) {
            return $this->fail('You can have at most '.self::MAX_UPCOMING_PER_STUDENT.' upcoming bookings. Cancel one to book another.');
        }

        // Pick a free room of this type. Locking the room rows makes two students
        // booking at the same moment wait for each other, so a room is never double-booked.
        $booking = DB::transaction(function () use ($type, $start, $end, $user) {
            $rooms = Room::where('room_type', $type)
                ->where('status', 'active')
                ->orderBy('id')
                ->lockForUpdate()
                ->get(['id']);

            $busy = Booking::active()
                ->whereIn('room_id', $rooms->pluck('id'))
                ->overlapping($this->toDb($start), $this->toDb($end))
                ->pluck('room_id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $room = $rooms->first(fn ($r) => ! in_array((int) $r->id, $busy, true));
            if (! $room) {
                return null;
            }

            return Booking::create([
                'user_id' => $user->id,
                'room_id' => $room->id,
                'start_at' => $this->toDb($start),
                'end_at' => $this->toDb($end),
                'status' => 'confirmed',
            ]);
        });

        if (! $booking) {
            return response()->json([
                'message' => "All {$group['name']} are taken for that time. Try another slot or join the waiting list.",
            ], 409);
        }

        return response()->json(['booking' => $this->payload($booking->load('room'))], 201);
    }

    /* ------------------------------------------------------------------
     | GET /api/bookings/mine
     * ------------------------------------------------------------------ */
    public function mine(Request $request): JsonResponse
    {
        $bookings = Booking::with('room')
            ->where('user_id', $request->user()->id)
            ->orderByDesc('start_at')
            ->limit(50)
            ->get();

        return response()->json([
            'bookings' => $bookings->map(fn ($b) => $this->payload($b))->values(),
        ]);
    }

    /* ------------------------------------------------------------------
     | POST /api/bookings/{booking}/cancel
     * ------------------------------------------------------------------ */
    public function cancel(Request $request, Booking $booking): JsonResponse
    {
        if ((int) $booking->user_id !== (int) $request->user()->id) {
            return response()->json(['message' => 'This booking does not belong to you.'], 403);
        }
        if (! in_array($booking->status, ['held', 'confirmed'], true)) {
            return $this->fail('Only confirmed bookings can be cancelled.');
        }
        if ($booking->start_at->lessThanOrEqualTo(now())) {
            return $this->fail('This booking has already started and can no longer be cancelled.');
        }

        $booking->status = 'cancelled';
        $booking->save();

        return response()->json(['booking' => $this->payload($booking->load('room'))]);
    }

    /* ================================================================== */

    /** The Browse Rooms group for a room_type, or a 404/422 if it can't be booked. */
    private function bookableGroup(string $type): array
    {
        $group = RoomController::GROUPS[$type] ?? null;
        abort_if(! $group, 404, 'Room type not found.');
        abort_if(! $group['bookable'], 422, "{$group['name']} can't be booked. No reservation is needed.");

        return $group;
    }

    private function durationsFor(string $type): array
    {
        return $type === 'carrel' ? [4] : [1, 2];
    }

    /** Hours a slot of this length may start at. */
    private function slotStarts(string $type, int $duration): array
    {
        if ($type === 'carrel') {
            return self::CARREL_BLOCKS;
        }

        return range(self::OPEN_HOUR, self::CLOSE_HOUR - $duration);
    }

    private function checkDay(Carbon $day): ?string
    {
        $today = Carbon::now(self::TZ)->startOfDay();

        if ($day->lessThan($today)) {
            return 'You can’t book a date in the past.';
        }
        if ($day->greaterThan($today->copy()->addDays(self::MAX_DAYS_AHEAD))) {
            return 'You can book up to '.self::MAX_DAYS_AHEAD.' days ahead.';
        }

        return null;
    }

    /** Dates are stored in the app timezone (UTC); convert before saving or comparing. */
    private function toDb(Carbon $time): Carbon
    {
        return $time->copy()->setTimezone(config('app.timezone'));
    }

    private function fail(string $message, int $status = 422): JsonResponse
    {
        return response()->json(['message' => $message], $status);
    }

    private function payload(Booking $booking): array
    {
        $start = $booking->start_at->copy()->setTimezone(self::TZ);
        $end = $booking->end_at->copy()->setTimezone(self::TZ);
        $now = Carbon::now(self::TZ);
        $type = $booking->room?->room_type;

        $tab = match (true) {
            in_array($booking->status, ['cancelled', 'no_show'], true) => 'cancelled',
            $booking->status === 'checked_out' || $end->lessThanOrEqualTo($now) => 'completed',
            default => 'upcoming',
        };

        return [
            'id' => $booking->id,
            'reference' => 'BK-'.str_pad((string) $booking->id, 4, '0', STR_PAD_LEFT),
            'room_id' => $booking->room_id,
            'room_name' => $booking->room?->room_name,
            'room_code' => $booking->room?->room_code,
            'room_type' => $type,
            'room_group' => RoomController::GROUPS[$type]['name'] ?? null,
            'location' => $booking->room?->location,
            'capacity' => $booking->room?->capacity,
            'start_at' => $start->toIso8601String(),
            'end_at' => $end->toIso8601String(),
            'date' => $start->format('Y-m-d'),
            'start_time' => $start->format('H:i'),
            'end_time' => $end->format('H:i'),
            'status' => $booking->status,
            'tab' => $tab,
            'can_cancel' => in_array($booking->status, ['held', 'confirmed'], true) && $start->greaterThan($now),
        ];
    }
}
