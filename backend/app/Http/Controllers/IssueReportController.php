<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\IssueReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Report an Issue (frontend: ReportIssue.jsx + reportService.js).
 *
 *   GET  /api/reports/bookings   bookings you can report a problem for
 *   GET  /api/reports/mine       your reports, newest first
 *   POST /api/reports            multipart: booking_id, issue_category, description, image?
 *
 * Photos are saved on the "public" disk (storage/app/public/issue-reports).
 * Run `php artisan storage:link` once so their URLs work.
 */
class IssueReportController extends Controller
{
    private const TZ = 'Asia/Kuala_Lumpur';

    /** How far back a booking can still be reported. */
    private const REPORT_WITHIN_DAYS = 30;

    /** Bookings that really happened (not cancelled, not an unanswered offer). */
    private const REPORTABLE_STATUSES = [
        Booking::STATUS_CONFIRMED,
        Booking::STATUS_CHECKED_IN,
        Booking::STATUS_CHECKED_OUT,
        Booking::STATUS_NO_SHOW, // until staff check-in exists, past bookings end up here
    ];

    public const MAX_IMAGE_KB = 5120; // 5 MB, same as the page

    /* ------------------------------------------------------------------
     | GET /api/reports/bookings
     * ------------------------------------------------------------------ */
    public function bookings(Request $request): JsonResponse
    {
        $bookings = $this->reportableBookings($request->user()->id)
            ->with('room:id,room_name,room_type')
            ->orderByDesc('start_at')
            ->limit(30)
            ->get();

        return response()->json([
            'bookings' => $bookings->map(fn (Booking $booking) => [
                'id' => $booking->id,
                'reference' => $booking->reference,
                'room_id' => $booking->room_id,
                'room_name' => $booking->room?->room_name,
                'room_type' => $booking->room?->room_type,
                'start_at' => $booking->start_at->copy()->setTimezone(self::TZ)->toIso8601String(),
                'end_at' => $booking->end_at->copy()->setTimezone(self::TZ)->toIso8601String(),
            ])->values(),
        ]);
    }

    /* ------------------------------------------------------------------
     | GET /api/reports/mine
     * ------------------------------------------------------------------ */
    public function mine(Request $request): JsonResponse
    {
        $reports = IssueReport::with('room:id,room_name')
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        return response()->json([
            'reports' => $reports->map(fn (IssueReport $report) => $this->payload($report))->values(),
        ]);
    }

    /* ------------------------------------------------------------------
     | POST /api/reports
     * ------------------------------------------------------------------ */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'booking_id' => ['required', 'integer'],
            'issue_category' => ['required', Rule::in(IssueReport::CATEGORIES)],
            'description' => ['required', 'string', 'min:10', 'max:500'],
            'image' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:'.self::MAX_IMAGE_KB],
        ], [
            'issue_category.in' => 'Choose what kind of problem it is.',
            'description.min' => 'Describe the problem in at least 10 characters.',
            'description.max' => 'Keep the description under 500 characters.',
            'image.mimes' => 'Use a JPG, PNG or WEBP photo.',
            'image.max' => 'Photo must be smaller than 5 MB.',
        ]);

        $userId = $request->user()->id;

        // Only your own bookings that have already started can be reported.
        $booking = $this->reportableBookings($userId)->whereKey($data['booking_id'])->first();
        if (! $booking) {
            return response()->json([
                'message' => 'Choose one of your bookings that has already started.',
            ], 422);
        }

        $imagePath = $request->hasFile('image')
            ? $request->file('image')->store('issue-reports', 'public')
            : null;

        $report = IssueReport::create([
            'booking_id' => $booking->id,
            'user_id' => $userId,
            'room_id' => $booking->room_id,
            'issue_category' => $data['issue_category'],
            'description' => trim($data['description']),
            'image_path' => $imagePath,
            'status' => IssueReport::STATUS_SUBMITTED,
        ]);

        return response()->json(['report' => $this->payload($report->fresh('room'))], 201);
    }

    /* ================================================================== */

    private function reportableBookings(int $userId)
    {
        $now = Carbon::now()->setTimezone(config('app.timezone'));

        return Booking::where('user_id', $userId)
            ->whereIn('status', self::REPORTABLE_STATUSES)
            ->where('start_at', '<=', $now)
            ->where('start_at', '>=', $now->copy()->subDays(self::REPORT_WITHIN_DAYS));
    }

    private function payload(IssueReport $report): array
    {
        return [
            'id' => $report->id,
            'reference' => 'RPT-'.str_pad((string) $report->id, 4, '0', STR_PAD_LEFT),
            'booking_id' => $report->booking_id,
            'room_name' => $report->room?->room_name,
            'issue_category' => $report->issue_category,
            'description' => $report->description,
            'image_url' => $report->image_path ? Storage::disk('public')->url($report->image_path) : null,
            'status' => $report->status,
            'created_at' => $report->created_at?->copy()->setTimezone(self::TZ)->toIso8601String(),
        ];
    }
}