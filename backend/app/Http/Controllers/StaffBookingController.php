<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class StaffBookingController extends Controller
{
    private const TZ = 'Asia/Kuala_Lumpur';

    private const STATUS_LABELS = [
        'held'        => 'Held',
        'confirmed'   => 'Confirmed',
        'checked_in'  => 'Checked In',
        'checked_out' => 'Checked Out',
        'cancelled'   => 'Cancelled',
        'no_show'     => 'No Show',
    ];

    /**
     * GET /api/staff/bookings?date=YYYY-MM-DD&all=1&status=confirmed
     * Defaults to today's reservations. all=1 ignores the date (latest 300).
     */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date'   => ['nullable', 'date_format:Y-m-d'],
            'all'    => ['nullable', 'boolean'],
            'status' => ['nullable', 'in:'.implode(',', array_keys(self::STATUS_LABELS))],
        ]);

        $query = Booking::with(['room', 'user']);

        if ($request->boolean('all')) {
            $query->orderByDesc('start_at')->limit(300);
            $date = null;
        } else {
            $date = $data['date'] ?? Carbon::now(self::TZ)->format('Y-m-d');
            $day = Carbon::createFromFormat('Y-m-d', $date, self::TZ)->startOfDay();

            // Bookings are stored in the app timezone (UTC), so convert the day first.
            $query->overlapping(
                $day->copy()->setTimezone(config('app.timezone')),
                $day->copy()->endOfDay()->setTimezone(config('app.timezone')),
            )->orderBy('start_at')->orderBy('id');
        }

        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }

        $rows = $query->get()->map(function (Booking $b) {
            $start = $b->start_at->copy()->setTimezone(self::TZ);
            $end = $b->end_at->copy()->setTimezone(self::TZ);
            $type = $b->room?->room_type;

            return [
                'id'           => $b->id,
                'reference'    => 'BK-'.str_pad((string) $b->id, 4, '0', STR_PAD_LEFT),
                'student'      => $b->user?->name,
                'matric'       => $b->user?->student_id,
                'room_code'    => $b->room?->room_code,
                'room_name'    => $b->room?->room_name,
                'room_group'   => RoomController::GROUPS[$type]['name'] ?? null,
                'date'         => $start->format('Y-m-d'),
                'start_time'   => $start->format('H:i'),
                'end_time'     => $end->format('H:i'),
                'status'       => $b->status,
                'status_label' => self::STATUS_LABELS[$b->status] ?? $b->status,
            ];
        })->values();

        return response()->json([
            'date'     => $date,
            'bookings' => $rows,
            'counts'   => (object) $rows->countBy('status')->all(),
        ]);
    
}

/**
 * POST /api/staff/bookings/{booking}/check-in
 */
public function checkIn(Request $request, Booking $booking): JsonResponse
{
    return DB::transaction(function () use ($request, $booking) {

        $booking = Booking::whereKey($booking->id)
            ->lockForUpdate()
            ->firstOrFail();

        if ($booking->status !== Booking::STATUS_CONFIRMED) {
            return response()->json([
                'message' => 'Only confirmed bookings can be checked in.'
            ], 422);
        }

        if ($booking->end_at->lessThanOrEqualTo(now())) {
            return response()->json([
                'message' => 'This booking has already ended.'
            ], 422);
        }

        $now = now();

        DB::table('booking_checkins')->insert([
            'booking_id' => $booking->id,
            'checked_in_at' => $now,
            'checked_in_by' => $request->user()->id,
        ]);

        $booking->status = Booking::STATUS_CHECKED_IN;
        $booking->save();

        return response()->json([
            'message' => 'Student checked in successfully.',
            'status' => $booking->status,
        ]);
    });
}

/**
 * POST /api/staff/bookings/{booking}/check-out
 */
public function checkOut(Request $request, Booking $booking): JsonResponse
{
    return DB::transaction(function () use ($request, $booking) {

        $booking = Booking::whereKey($booking->id)
            ->lockForUpdate()
            ->firstOrFail();

        if ($booking->status !== Booking::STATUS_CHECKED_IN) {
            return response()->json([
                'message' => 'Only checked-in bookings can be checked out.'
            ], 422);
        }

        $checkin = DB::table('booking_checkins')
            ->where('booking_id', $booking->id)
            ->whereNull('checked_out_at')
            ->orderByDesc('id')
            ->lockForUpdate()
            ->first();

        if (!$checkin) {
            return response()->json([
                'message' => 'No active check-in record was found.'
            ], 422);
        }

        $checkoutTime = now();

        if ($checkoutTime->lessThanOrEqualTo(
            Carbon::parse($checkin->checked_in_at)
        )) {
            $checkoutTime = Carbon::parse($checkin->checked_in_at)->addSecond();
        }

        DB::table('booking_checkins')
            ->where('id', $checkin->id)
            ->update([
                'checked_out_at' => $checkoutTime,
                'checked_out_by' => $request->user()->id,
            ]);

        $booking->status = Booking::STATUS_CHECKED_OUT;
        $booking->save();

        return response()->json([
            'message' => 'Student checked out successfully.',
            'status' => $booking->status,
        ]);
    });
}
}