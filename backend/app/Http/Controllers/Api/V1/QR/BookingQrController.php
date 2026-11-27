<?php

namespace App\Http\Controllers\Api\V1\QR;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Services\QR\BookingQrService;
use App\Services\WaitingListService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingQrController extends Controller
{
    public function __construct(private BookingQrService $qr) {}

    public function issue(Request $request, Booking $booking): JsonResponse
    {
        if ((int) $booking->user_id !== (int) $request->user()->id) {
            return response()->json(['message' => 'Booking not found.'], 404);
        }

        $state = $this->qr->state($booking);

        if ($state === 'used') {
            return response()->json(['message' => 'You have already checked out of this booking.'], 422);
        }
        if ($state === 'expired') {
            $message = $booking->status === Booking::STATUS_CONFIRMED
                ? 'This QR code has expired because you did not check in within '
                    .WaitingListService::CHECK_IN_GRACE_MINUTES.' minutes. The booking will be cancelled.'
                : 'QR code is unavailable for this booking.';

            return response()->json(['message' => $message], 422);
        }

        $token = $this->qr->issue($booking);

        return response()->json([
            ...$this->qr->status($booking),
            'qr_token' => $token,
        ])->header('Cache-Control', 'no-store');
    }

    public function status(Request $request, Booking $booking): JsonResponse
    {
        if ((int) $booking->user_id !== (int) $request->user()->id) {
            return response()->json(['message' => 'Booking not found.'], 404);
        }

        return response()->json($this->qr->status($booking))->header('Cache-Control', 'no-store');
    }
}