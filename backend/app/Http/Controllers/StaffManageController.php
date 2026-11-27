<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Room;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\WaitingListService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Staff: add, edit and cancel bookings, and close a room for a period.
 *
 *   GET    /api/staff/room-options             rooms for the forms
 *   POST   /api/staff/bookings                 { matric, room_id, date, start, end }
 *   PATCH  /api/staff/bookings/{booking}       { room_id, date, start, end }
 *   POST   /api/staff/bookings/{booking}/cancel { reason? }
 *   GET    /api/staff/closures                 upcoming closures
 *   POST   /api/staff/closures                 { room_id, date, start, end }
 *   DELETE /api/staff/closures/{booking}       reopen
 *
 * A closure is stored as a "held" booking owned by the staff account (no new table):
 * it blocks the room like any booking, but is never checked in, never becomes a
 * no-show and gets no reminders.
 */
class StaffManageController extends Controller
{
    private const TZ = 'Asia/Kuala_Lumpur';

    private const OPEN_HOUR = 8;

    private const CLOSE_HOUR = 22;

    /** Closures can be planned further ahead than student bookings. */
    private const CLOSURE_DAYS_AHEAD = 60;

    /* ------------------------------------------------------------------ */

    public function roomOptions(): JsonResponse
    {
        $rooms = Room::orderBy('room_type')->orderBy('room_code')->get();

        return response()->json([
            'rooms' => $rooms->map(fn (Room $r) => [
                'id' => $r->id,
                'code' => $r->room_code,
                'name' => $r->room_name,
                'type' => $r->room_type,
                'group' => RoomController::GROUPS[$r->room_type]['name'] ?? $r->room_type,
                'status' => $r->status,
            ])->values(),
        ]);
    }

    /* ------------------------------------------------------------------ */

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->timeRules() + [
            'matric' => ['required', 'string', 'max:50'],
        ]);

        $student = User::where('student_id', trim($data['matric']))->where('role', 'student')->first();
        if (! $student) {
            return $this->fail('No student account has that matric number.');
        }

        [$start, $end, $error] = $this->period($data, studentBooking: true);
        if ($error) {
            return $this->fail($error);
        }

        $result = DB::transaction(function () use ($data, $student, $start, $end) {
            $room = Room::whereKey($data['room_id'])->lockForUpdate()->first();
            if ($error = $this->roomProblem($room, $start, $end, null, $student->id)) {
                return $error;
            }

            return Booking::create([
                'user_id' => $student->id,
                'room_id' => $room->id,
                'start_at' => $start,
                'end_at' => $end,
                'status' => Booking::STATUS_CONFIRMED,
            ]);
        });

        if (is_string($result)) {
            return $this->fail($result, 409);
        }

        $this->tell($student->id, 'booking_added_by_staff',
            "Library staff booked {$result->room->room_name} for you on {$this->when($result)}.");

        return response()->json(['message' => "Booked {$result->room->room_name} for {$student->name}.", 'booking' => $this->row($result)], 201);
    }

    public function update(Request $request, Booking $booking): JsonResponse
    {
        if ($this->isClosure($booking)) {
            return $this->fail('This is a room closure. Reopen it and close the room again instead.');
        }
        if (! in_array($booking->status, [Booking::STATUS_CONFIRMED, Booking::STATUS_CHECKED_IN], true)) {
            return $this->fail('Only confirmed or checked-in bookings can be changed.');
        }

        $data = $request->validate($this->timeRules());

        [$start, $end, $error] = $this->period($data, studentBooking: true, allowStarted: $booking->status === Booking::STATUS_CHECKED_IN);
        if ($error) {
            return $this->fail($error);
        }
        if ($booking->status === Booking::STATUS_CHECKED_IN && (int) $data['room_id'] !== (int) $booking->room_id) {
            return $this->fail('The student is already in the room, so only the time can change.');
        }

        $before = $this->when($booking).' in '.$booking->room?->room_name;

        $result = DB::transaction(function () use ($data, $booking, $start, $end) {
            $room = Room::whereKey($data['room_id'])->lockForUpdate()->first();
            if ($error = $this->roomProblem($room, $start, $end, $booking->id, $booking->user_id)) {
                return $error;
            }

            $booking->room_id = $room->id;
            $booking->start_at = $start;
            $booking->end_at = $end;
            $booking->save();

            return $booking->fresh('room');
        });

        if (is_string($result)) {
            return $this->fail($result, 409);
        }

        $this->tell($result->user_id, 'booking_changed_by_staff',
            "Library staff changed your booking ({$before}) to {$this->when($result)} in {$result->room->room_name}.");

        return response()->json(['message' => 'Booking updated.', 'booking' => $this->row($result)]);
    }

    public function cancel(Request $request, Booking $booking): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:200']]);

        if ($this->isClosure($booking)) {
            return $this->fail('This is a room closure. Use Reopen instead.');
        }
        if (! in_array($booking->status, [Booking::STATUS_HELD, Booking::STATUS_CONFIRMED], true)) {
            return $this->fail('Only confirmed bookings can be cancelled. Check the student out instead.');
        }
        if ($booking->end_at->lessThanOrEqualTo(now())) {
            return $this->fail('This booking has already ended.');
        }

        $booking->status = Booking::STATUS_CANCELLED;
        $booking->save();

        $reason = trim((string) ($data['reason'] ?? ''));
        $this->tell($booking->user_id, 'booking_cancelled_by_staff',
            "Library staff cancelled your booking for {$booking->room?->room_name} on {$this->when($booking)}."
            .($reason !== '' ? " Reason: {$reason}" : ''));

        app(WaitingListService::class)->offerFreeRooms();

        return response()->json(['message' => 'Booking cancelled. The student has been told.', 'booking' => $this->row($booking)]);
    }

    /* ------------------------------------------------------------------ */

    public function closures(): JsonResponse
    {
        $closures = Booking::with('room')
            ->where('status', Booking::STATUS_HELD)
            ->whereIn('user_id', User::where('role', 'staff')->select('id'))
            ->where('end_at', '>', now())
            ->orderBy('start_at')
            ->get();

        return response()->json(['closures' => $closures->map(fn (Booking $b) => $this->row($b))->values()]);
    }

    public function close(Request $request): JsonResponse
    {
        $data = $request->validate($this->timeRules());

        [$start, $end, $error] = $this->period($data, studentBooking: false);
        if ($error) {
            return $this->fail($error);
        }

        $staffId = $request->user()->id;
        $result = DB::transaction(function () use ($data, $start, $end, $staffId) {
            $room = Room::whereKey($data['room_id'])->lockForUpdate()->first();
            if ($error = $this->roomProblem($room, $start, $end, null, null)) {
                return $error;
            }

            return Booking::create([
                'user_id' => $staffId,
                'room_id' => $room->id,
                'start_at' => $start,
                'end_at' => $end,
                'status' => Booking::STATUS_HELD,
            ]);
        });

        if (is_string($result)) {
            return $this->fail($result, 409);
        }

        return response()->json([
            'message' => "{$result->room->room_name} is closed on {$this->when($result)}. Students can't book it then.",
            'closure' => $this->row($result),
        ], 201);
    }

    public function reopen(Booking $booking): JsonResponse
    {
        if (! $this->isClosure($booking) || $booking->status !== Booking::STATUS_HELD) {
            return $this->fail('That is not an open room closure.', 404);
        }

        $booking->status = Booking::STATUS_CANCELLED;
        $booking->save();

        app(WaitingListService::class)->offerFreeRooms();

        return response()->json(['message' => "{$booking->room?->room_name} is open again."]);
    }

    /* ================================================================== */

    private function timeRules(): array
    {
        return [
            'room_id' => ['required', 'integer', 'exists:rooms,id'],
            'date' => ['required', 'date_format:Y-m-d'],
            'start' => ['required', 'date_format:H:i'],
            'end' => ['required', 'date_format:H:i'],
        ];
    }

    /**
     * Turn date + start + end (Malaysia time) into database times, with the opening-hours
     * and how-far-ahead rules (one week for student bookings). Returns [start, end, error].
     */
    private function period(array $data, bool $studentBooking, bool $allowStarted = false): array
    {
        $start = Carbon::createFromFormat('Y-m-d H:i', "{$data['date']} {$data['start']}", self::TZ);
        $end = Carbon::createFromFormat('Y-m-d H:i', "{$data['date']} {$data['end']}", self::TZ);
        $now = Carbon::now(self::TZ);

        $error = match (true) {
            $end->lessThanOrEqualTo($start) => 'The end time must be after the start time.',
            $start->hour < self::OPEN_HOUR || $end->greaterThan($end->copy()->setTime(self::CLOSE_HOUR, 0))
                => 'The library is open from 8:00 AM to 10:00 PM.',
            $end->lessThanOrEqualTo($now) => 'That time has already passed.',
            $studentBooking && ! $allowStarted && $start->lessThan($now->copy()->subMinute())
                => 'That time has already started. Choose a later start time.',
            default => null,
        };

        if (! $error && $studentBooking) {
            $error = BookingController::checkDay($start->copy()->startOfDay());
        }
        if (! $error && ! $studentBooking && $start->greaterThan($now->copy()->addDays(self::CLOSURE_DAYS_AHEAD))) {
            $error = 'A room can be closed up to '.self::CLOSURE_DAYS_AHEAD.' days ahead.';
        }

        $appTz = config('app.timezone');

        return [$start->copy()->setTimezone($appTz), $end->copy()->setTimezone($appTz), $error];
    }

    /** Why this room can't be used then (or null). Call inside a transaction with the room locked. */
    private function roomProblem(?Room $room, Carbon $start, Carbon $end, ?int $ignoreId, ?int $studentId): ?string
    {
        if (! $room) {
            return 'That room no longer exists.';
        }
        if ($room->status !== 'active') {
            return "{$room->room_name} is under maintenance.";
        }

        $clash = Booking::with('user')->active()
            ->where('room_id', $room->id)
            ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))
            ->overlapping($start, $end)
            ->orderBy('start_at')
            ->first();

        if ($clash) {
            $times = $this->clock($clash->start_at).'–'.$this->clock($clash->end_at);

            return $this->isClosure($clash)
                ? "{$room->room_name} is closed by staff from {$times}."
                : "{$room->room_name} is already booked from {$times} (BK-".str_pad((string) $clash->id, 4, '0', STR_PAD_LEFT).').';
        }

        if ($studentId && Booking::active()
            ->where('user_id', $studentId)
            ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))
            ->overlapping($start, $end)
            ->exists()) {
            return 'This student already has another booking at that time.';
        }

        return null;
    }

    private function isClosure(Booking $booking): bool
    {
        return $booking->user?->role === 'staff';
    }

    private function tell(int $userId, string $type, string $message): void
    {
        UserNotification::create([
            'user_id' => $userId,
            'message_type' => $type,
            'message' => $message,
            'delivered_at' => now(),
            'status' => 'sent',
        ]);
    }

    private function row(Booking $b): array
    {
        $b->loadMissing('room', 'user');

        return [
            'id' => $b->id,
            'reference' => 'BK-'.str_pad((string) $b->id, 4, '0', STR_PAD_LEFT),
            'room_id' => $b->room_id,
            'room_name' => $b->room?->room_name,
            'room_code' => $b->room?->room_code,
            'student' => $b->user?->name,
            'matric' => $b->user?->student_id,
            'date' => $b->start_at->copy()->setTimezone(self::TZ)->format('Y-m-d'),
            'start_time' => $b->start_at->copy()->setTimezone(self::TZ)->format('H:i'),
            'end_time' => $b->end_at->copy()->setTimezone(self::TZ)->format('H:i'),
            'status' => $b->status,
            'is_closure' => $this->isClosure($b),
        ];
    }

    private function clock(Carbon $time): string
    {
        return $time->copy()->setTimezone(self::TZ)->format('g:i A');
    }

    private function when(Booking $b): string
    {
        $start = $b->start_at->copy()->setTimezone(self::TZ);

        return $start->format('D j M, g:i A').' – '.$this->clock($b->end_at);
    }

    private function fail(string $message, int $status = 422): JsonResponse
    {
        return response()->json(['message' => $message], $status);
    }
}