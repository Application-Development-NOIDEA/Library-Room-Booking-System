<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingQrController extends Controller
{
    public function issue(Request $request, Booking $booking): JsonResponse
    {
        // Students may only generate QR codes for their own bookings.
        if ((int) $booking->user_id !== (int) $request->user()->id) {
            return response()->json([
                'message' => 'Booking not found.',
            ], 404);
        }

        // Only active bookings can receive QR tokens.
        if (! in_array($booking->status, ['confirmed', 'checked_in'], true)) {
            return response()->json([
                'message' => 'QR code is unavailable for this booking.',
            ], 422);
        }

        // Prevent QR generation for expired, unchecked-in bookings.
        if ($booking->status === 'confirmed'
            && $booking->end_at->lessThanOrEqualTo(now())) {
            return response()->json([
                'message' => 'This booking has already ended.',
            ], 422);
        }

        // Generate a cryptographically secure random token.
        $token = bin2hex(random_bytes(32));

        // Store only the hash in Supabase, never the raw token.
        $booking->qr_token_hash = hash('sha256', $token);
        $booking->save();

        return response()->json([
            'booking_id' => $booking->id,
            'reference' => 'BK-' . str_pad(
                (string) $booking->id,
                4,
                '0',
                STR_PAD_LEFT
            ),
            'qr_token' => $token,
        ])->header('Cache-Control', 'no-store');
    }
}
