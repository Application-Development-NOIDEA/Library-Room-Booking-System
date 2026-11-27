<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\BookingCheckin;
use App\Models\BookingExtension;
use App\Models\IssueReport;
use App\Models\Room;
use App\Models\User;
use App\Models\WaitingList;
use App\Services\QR\BookingQrService;
use App\Services\WaitingListService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** The staff front desk: dashboard data, check-in/out, walk-ins, rooms, extensions, reports. */
class StaffDeskController extends Controller
{
    private const TZ = 'Asia/Kuala_Lumpur';

    private const MAX_WALK_IN_HOURS = 4;

    public function __construct(private BookingQrService $qr) {}

    /* ------------------------------------------------------------------
     | GET /api/staff/dashboard
     * ------------------------------------------------------------------ */
    public function dashboard(): JsonResponse
    {
        $appTz = config('app.timezone');
        $dayStart = Carbon::now(self::TZ)->startOfDay();
        $dayEnd = $dayStart->copy()->endOfDay();

        $bookings = Booking::with(['room', 'user', 'checkins'])
            ->overlapping($dayStart->copy()->setTimezone($appTz), $dayEnd->copy()->setTimezone($appTz))
            ->orderBy('start_at')->orderBy('id')
            ->get();

        $rooms = Room::orderBy('room_code')->get();

        $waitlist = WaitingList::with('user:id,name')
            ->whereIn('status', WaitingList::ACTIVE_STATUSES)
            ->orderBy('joined_at')->orderBy('id')
            ->limit(100)->get();

        $extensions = BookingExtension::with(['booking.room', 'booking.user'])
            ->orderByRaw("case when status = 'pending' then 0 else 1 end")
            ->orderByDesc('id')
            ->limit(50)->get();

                $reports = IssueReport::with(['room:id,room_code,room_name', 'user:id,name', 'analysis'])
            ->orderByRaw("case when status = 'resolved' then 1 else 0 end")
            ->orderByDesc('id')
            ->limit(100)->get();

        return response()->json([
            'bookings' => $bookings->map(fn (Booking $b) => $this->row($b))->values(),
            'rooms' => $rooms->map(fn (Room $r) => [
                'id' => $r->id,
                'code' => $r->room_code,
                'name' => $r->room_name,
                'type' => ucfirst(str_replace('_', ' ', $r->room_type)),
                'capacity' => $r->capacity,
                'floor' => $r->location,
                'status' => $r->status,
            ])->values(),
            'waitlist' => $waitlist->map(function (WaitingList $w) {
                $start = $w->wanted_start->copy()->setTimezone(self::TZ);
                $end = $w->wanted_end->copy()->setTimezone(self::TZ);

                return [
                    'id' => $w->id,
                    'name' => $w->user?->name,
                    'type' => ucfirst(str_replace('_', ' ', $w->room_type)),
                    'party_size' => $w->party_size,
                    'date' => $start->format('Y-m-d'),
                    'time' => $start->format('H:i').'–'.$end->format('H:i'),
                    'status' => $w->status,
                ];
            })->values(),
            'extensions' => $extensions->map(fn (BookingExtension $x) => [
                'id' => $x->id,
                'booking_id' => $x->booking_id,
                'reference' => $x->booking?->reference,
                'student' => $x->booking?->user?->name,
                'room' => $x->booking?->room?->room_code,
                'current_end' => $x->booking?->end_at->copy()->setTimezone(self::TZ)->format('H:i'),
                'requested_end' => $x->requested_end_at->copy()->setTimezone(self::TZ)->format('H:i'),
                'status' => $x->status,
            ])->values(),
            'reports' => $reports->map(fn (IssueReport $r) => [
                'id' => $r->id,
                'reference' => 'RPT-'.str_pad((string) $r->id, 4, '0', STR_PAD_LEFT),
                'room' => $r->room?->room_code,
                'student' => $r->user?->name,
                'category' => Str::headline($r->issue_category),
                'description' => $r->description,
                'image_url' => $r->image_path ? Storage::disk('public')->url($r->image_path) : null,
                'status' => $r->status,
                 'ai' => $r->analysis ? [
                    'state' => $r->analysis->state,
                    'reason' => $r->analysis->review_reason,
                    'category' => $r->analysis->final_category ?? $r->analysis->ai_category,
                    'severity' => $r->analysis->final_severity ?? $r->analysis->ai_severity,
                    'summary' => $r->analysis->final_summary ?? $r->analysis->ai_summary,
                    'confidence' => $r->analysis->ai_confidence,
                ] : null,
            ])->values(),
        ]);
    }

    /* ------------------------------------------------------------------
     | POST /api/staff/bookings/lookup   { query: "BK-0012" | <QR token> }
     * ------------------------------------------------------------------ */
    public function lookup(Request $request): JsonResponse
    {
        $query = trim($request->validate(['query' => ['required', 'string', 'max:200']])['query']);

        $booking = $this->find($query);

        if (! $booking) {
            return response()->json(['message' => 'No booking found for that reference or QR code.'], 404);
        }

        return response()->json(['booking' => $this->row($booking)]);
    }

    /* ------------------------------------------------------------------
     | POST /api/staff/bookings/scan   { query: <QR token> | "BK-0012" }
     |
     | One step at the desk: a scanned QR checks the student in, and the
     | same QR scanned again checks them out. Expired codes are refused.
     * ------------------------------------------------------------------ */
    public function scan(Request $request): JsonResponse
    {
        $query = trim($request->validate(['query' => ['required', 'string', 'max:200']])['query']);
        $booking = $this->find($query);

        if (! $booking) {
            return response()->json([
                'message' => preg_match(BookingQrService::TOKEN_PATTERN, $query)
                    ? 'This QR code is not valid. It may be an old code: ask the student to open the QR again in My Bookings.'
                    : 'No booking found for that reference or QR code.',
                'result' => 'invalid',
            ], 404);
        }

        $state = $this->qr->state($booking);
        $action = match ($state) {
            'check_in' => 'checked_in',
            'check_out' => 'checked_out',
            default => null,
        };

        if (! $action) {
            $message = match ($state) {
                'not_yet_open' => 'Too early. Check-in opens at '
                    .$this->qr->checkInOpensAt($booking)->setTimezone(self::TZ)->format('H:i').'.',
                'used' => 'This student has already checked out.',
                default => $booking->status === Booking::STATUS_CONFIRMED
                    ? 'This QR code has expired: the student did not check in within '
                        .WaitingListService::CHECK_IN_GRACE_MINUTES.' minutes, so the booking is being cancelled.'
                    : 'This QR code is no longer valid (booking is '.str_replace('_', ' ', $booking->status).').',
            };

            return response()->json([
                'message' => $message,
                'result' => $state,
                'booking' => $this->row($booking),
            ], 422);
        }

        $error = $action === 'checked_in'
            ? $this->qr->checkIn($booking, $request->user())
            : $this->qr->checkOut($booking, $request->user());

        if ($error) {
            return response()->json(['message' => $error, 'result' => 'refused', 'booking' => $this->row($booking->fresh(['room', 'user']))], 422);
        }

        $fresh = $booking->fresh(['room', 'user']);

        return response()->json([
            'result' => $action,
            'message' => ($fresh->user?->name ?? 'Student').($action === 'checked_in' ? ' is checked in to ' : ' is checked out of ')
                .($fresh->room?->room_name ?? 'the room').'.',
            'booking' => $this->row($fresh),
        ]);
    }

    /* ------------------------------------------------------------------
     | POST /api/staff/bookings/{booking}/check-in
     * ------------------------------------------------------------------ */
    public function checkIn(Request $request, Booking $booking): JsonResponse
    {
        if ($error = $this->qr->checkIn($booking, $request->user())) {
            return response()->json(['message' => $error], 422);
        }

        return response()->json(['booking' => $this->row($booking->fresh(['room', 'user']))]);
    }

    /* ------------------------------------------------------------------
     | POST /api/staff/bookings/{booking}/check-out
     * ------------------------------------------------------------------ */
    public function checkOut(Request $request, Booking $booking): JsonResponse
    {
        if ($error = $this->qr->checkOut($booking, $request->user())) {
            return response()->json(['message' => $error], 422);
        }

        return response()->json(['booking' => $this->row($booking->fresh(['room', 'user']))]);
    }

    /* ------------------------------------------------------------------
     | POST /api/staff/bookings/{booking}/no-show
     * ------------------------------------------------------------------ */
    public function noShow(Request $request, Booking $booking): JsonResponse
    {
        $now = Carbon::now();

        $error = DB::transaction(function () use ($booking, $now) {
            $b = Booking::whereKey($booking->id)->lockForUpdate()->first();

            if ($b->status !== Booking::STATUS_CONFIRMED) {
                return 'Only confirmed bookings can be marked as no-show.';
            }
            if ($now->lessThan($b->start_at)) {
                return 'This booking has not started yet.';
            }

            $b->status = Booking::STATUS_NO_SHOW;
            $b->save();

            return null;
        });

        if ($error) {
            return response()->json(['message' => $error], 422);
        }

        Log::info('Booking marked as no-show by staff', [
            'booking_id' => $booking->id,
            'staff_id' => $request->user()->id,
        ]);

        return response()->json(['booking' => $this->row($booking->fresh(['room', 'user']))]);
    }

    /* ------------------------------------------------------------------
     | POST /api/staff/walk-ins   { matric, room_id, start: "HH:MM", end: "HH:MM" }
     * ------------------------------------------------------------------ */
    public function walkIn(Request $request): JsonResponse
    {
        $data = $request->validate([
            'matric' => ['required', 'string', 'max:50'],
            'room_id' => ['required', 'integer', 'exists:rooms,id'],
            'start' => ['required', 'date_format:H:i'],
            'end' => ['required', 'date_format:H:i'],
        ]);

        $student = User::where('student_id', trim($data['matric']))->where('role', 'student')->first();
        if (! $student) {
            return response()->json(['message' => 'No student account has that matric number. They need to register first.'], 422);
        }

        $today = Carbon::now(self::TZ)->format('Y-m-d');
        $now = Carbon::now(self::TZ);
        $start = Carbon::createFromFormat('Y-m-d H:i', "{$today} {$data['start']}", self::TZ);
        $end = Carbon::createFromFormat('Y-m-d H:i', "{$today} {$data['end']}", self::TZ);

        if ($end->lessThanOrEqualTo($start)) {
            return response()->json(['message' => 'End time must be later than start time.'], 422);
        }
        if ($end->lessThanOrEqualTo($now)) {
            return response()->json(['message' => 'That time has already passed.'], 422);
        }
        if ($start->diffInMinutes($end) > self::MAX_WALK_IN_HOURS * 60) {
            return response()->json(['message' => 'A walk-in can be at most '.self::MAX_WALK_IN_HOURS.' hours.'], 422);
        }

        $appTz = config('app.timezone');
        $startDb = $start->copy()->setTimezone($appTz);
        $endDb = $end->copy()->setTimezone($appTz);

        $result = DB::transaction(function () use ($data, $student, $request, $start, $now, $startDb, $endDb) {
            // Lock the room so two walk-ins can't take the same slot.
            $room = Room::whereKey($data['room_id'])->lockForUpdate()->first();

            if ($room->status !== 'active') {
                return 'This room is under maintenance.';
            }
            if (Booking::active()->where('room_id', $room->id)->overlapping($startDb, $endDb)->exists()) {
                return 'That room is already booked for part of this time.';
            }

            // Already started = the student is here, so they are checked in straight away.
            $here = $start->lessThanOrEqualTo($now);

            $booking = Booking::create([
                'user_id' => $student->id,
                'room_id' => $room->id,
                'start_at' => $startDb,
                'end_at' => $endDb,
                'status' => $here ? Booking::STATUS_CHECKED_IN : Booking::STATUS_CONFIRMED,
            ]);

            if ($here) {
                BookingCheckin::create([
                    'booking_id' => $booking->id,
                    'checked_in_at' => Carbon::now(),
                    'checked_in_by' => $request->user()->id,
                ]);
            }

            return $booking;
        });

        if (is_string($result)) {
            return response()->json(['message' => $result], 422);
        }

        return response()->json(['booking' => $this->row($result->load(['room', 'user']))], 201);
    }

    /* ------------------------------------------------------------------
     | PATCH /api/staff/rooms/{room}/status   { status: active | maintenance }
     * ------------------------------------------------------------------ */
    public function setRoomStatus(Request $request, Room $room): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(['active', 'maintenance'])]]);

        $room->status = $data['status'];
        $room->save();

        // Existing bookings are left alone; staff are told how many students to contact.
        $affected = $data['status'] === 'maintenance'
            ? Booking::where('room_id', $room->id)
                ->whereIn('status', [Booking::STATUS_HELD, Booking::STATUS_CONFIRMED])
                ->where('end_at', '>', Carbon::now())
                ->count()
            : 0;

        return response()->json([
            'room' => ['id' => $room->id, 'status' => $room->status],
            'affected_bookings' => $affected,
        ]);
    }

    /* ------------------------------------------------------------------
     | POST /api/staff/waitlist/process   run the no-show / offer check right now
     * ------------------------------------------------------------------ */
    public function processWaitlist(WaitingListService $service): JsonResponse
    {
        return response()->json(['result' => $service->process()]);
    }

    /* ------------------------------------------------------------------
     | PATCH /api/staff/extensions/{extension}/decision   { decision: approved | rejected }
     * ------------------------------------------------------------------ */
    public function decideExtension(Request $request, int $extension): JsonResponse
    {
        $data = $request->validate(['decision' => ['required', Rule::in(['approved', 'rejected'])]]);

        $outcome = DB::transaction(function () use ($extension, $data) {
            $ext = BookingExtension::whereKey($extension)->lockForUpdate()->first();

            if (! $ext) {
                return [404, 'Extension request not found.'];
            }
            if ($ext->status !== 'pending') {
                return [409, 'This request has already been decided.'];
            }

            if ($data['decision'] === 'approved') {
                $booking = Booking::with('room')->whereKey($ext->booking_id)->lockForUpdate()->first();

                if (! $booking || ! in_array($booking->status, [Booking::STATUS_CONFIRMED, Booking::STATUS_CHECKED_IN], true)) {
                    return [422, 'That booking is no longer active.'];
                }
                if ($ext->requested_end_at->lessThanOrEqualTo($booking->end_at)) {
                    return [422, 'The requested end time is not later than the current end time.'];
                }
                if ($booking->room?->status !== 'active') {
                    return [422, 'The room is under maintenance.'];
                }

                $clash = Booking::active()
                    ->where('room_id', $booking->room_id)
                    ->where('id', '!=', $booking->id)
                    ->overlapping($booking->end_at, $ext->requested_end_at)
                    ->exists();
                if ($clash) {
                    return [422, 'Another booking uses this room right after the current end time.'];
                }

                $booking->end_at = $ext->requested_end_at;
                $booking->save();
            }

            $ext->status = $data['decision'];
            $ext->save();

            return null;
        });

        if ($outcome) {
            return response()->json(['message' => $outcome[1]], $outcome[0]);
        }

        return response()->json(['message' => 'Extension '.$data['decision'].'.']);
    }

    /* ------------------------------------------------------------------
     | PATCH /api/staff/reports/{report}/status   { status }
     * ------------------------------------------------------------------ */
    public function setReportStatus(Request $request, IssueReport $report): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['submitted', 'in_progress', 'resolved'])],
        ]);

        $report->status = $data['status'];
        $report->save();

        return response()->json(['report' => ['id' => $report->id, 'status' => $report->status]]);
    }

    /* ================================================================== */

    /** A booking from a reference (BK-0012) or a scanned QR token. */
    private function find(string $query): ?Booking
    {
        if (preg_match('/^BK-?(\d+)$/i', $query, $match)) {
            return Booking::with(['room', 'user'])->find((int) $match[1]);
        }

        // The student's QR holds a random token; only its hash is stored.
        return $this->qr->findByToken($query);
    }

    private function row(Booking $b): array
    {
        $start = $b->start_at->copy()->setTimezone(self::TZ);
        $end = $b->end_at->copy()->setTimezone(self::TZ);

        return [
            'id' => $b->id,
            'reference' => $b->reference,
            'student' => $b->user?->name,
            'matric' => $b->user?->student_id,
            'room_code' => $b->room?->room_code,
            'room_name' => $b->room?->room_name,
            'date' => $start->format('Y-m-d'),
            'start_time' => $start->format('H:i'),
            'end_time' => $end->format('H:i'),
            'status' => $b->status,
            'qr_state' => $this->qr->state($b),
            'check_in_deadline' => $this->qr->checkInDeadline($b)->setTimezone(self::TZ)->format('H:i'),
            ...$this->qr->times($b),
        ];
    }
}