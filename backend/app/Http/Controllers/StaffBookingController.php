<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

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
}