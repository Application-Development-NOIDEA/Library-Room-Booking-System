<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\BookingExtension;
use App\Models\Room;
use App\Models\WaitingList;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Request Extension (frontend: My Bookings).
 *
 *   POST /api/bookings/{booking}/extend   { hours: 1 | 2 }
 *
 * The extra time is given straight away when:
 *  - the same room is free for that time,
 *  - nobody on the waiting list wants that room type at that time
 *    (people in the queue come first), and
 *  - the booking still ends before the library closes.
 * Students can only ask in the last 15 minutes of their booking.
 * Otherwise the request is refused with the reason. Every request is
 * saved in booking_extensions (approved or rejected).
 */
class BookingExtensionController extends Controller
{
    private const TZ = 'Asia/Kuala_Lumpur';

    public const HOURS = [1, 2];

    /** Requests are accepted only in the last 15 minutes of a booking. */
    public const REQUEST_WINDOW_MINUTES = 15;

    public function store(Request $request, Booking $booking): JsonResponse
    {
        if ((int) $booking->user_id !== (int) $request->user()->id) {
            return response()->json(['message' => 'This booking does not belong to you.'], 403);
        }

        $data = $request->validate(
            ['hours' => ['required', 'integer', 'in:'.implode(',', self::HOURS)]],
            ['hours.in' => 'You can extend by 1 or 2 hours.']
        );
        $hours = (int) $data['hours'];

        if (! in_array($booking->status, [Booking::STATUS_CONFIRMED, Booking::STATUS_CHECKED_IN], true)) {
            return $this->fail('Only confirmed or checked-in bookings can be extended.');
        }

        $now = Carbon::now()->setTimezone(config('app.timezone'));
        if ($booking->end_at->lessThanOrEqualTo($now)) {
            return $this->fail('This booking has already ended.');
        }

        $opensAt = $booking->end_at->copy()->subMinutes(self::REQUEST_WINDOW_MINUTES);
        if ($now->lessThan($opensAt)) {
            return $this->fail('You can request an extension in the last '.self::REQUEST_WINDOW_MINUTES
                .' minutes of your booking (from '.$this->time($opensAt).').');
        }

        $oldEnd = $booking->end_at->copy();
        $newEnd = $oldEnd->copy()->addHours($hours);

        $closing = $oldEnd->copy()->setTimezone(self::TZ)->setTime(BookingController::CLOSE_HOUR, 0);
        if ($newEnd->greaterThan($closing)) {
            return $this->fail('The library closes at '.$closing->format('g:i A')
                .', so this booking can only be extended until then.');
        }

        // Check and extend inside one transaction, locking the room so two
        // students can't take the same extra hour at the same moment.
        [$status, $message] = DB::transaction(function () use ($booking, $oldEnd, $newEnd) {
            $room = Room::whereKey($booking->room_id)->lockForUpdate()->first();

            $clash = Booking::active()
                ->where('room_id', $booking->room_id)
                ->whereKeyNot($booking->id)
                ->overlapping($oldEnd, $newEnd)
                ->orderBy('start_at')
                ->first();
            if ($clash) {
                return [BookingExtension::STATUS_REJECTED,
                    "Someone has booked {$room?->room_name} from {$this->time($clash->start_at)}, so it can't be extended."];
            }

            $queueWaiting = WaitingList::active()
                ->where('room_type', $room?->room_type)
                ->where(fn ($q) => $q->whereNull('room_id')->orWhere('room_id', $booking->room_id))
                ->where('wanted_start', '<', $newEnd)
                ->where('wanted_end', '>', $oldEnd)
                ->exists();
            if ($queueWaiting) {
                return [BookingExtension::STATUS_REJECTED,
                    'Other students are on the waiting list for this time, so the room goes to them first.'];
            }

            $ownClash = Booking::active()
                ->where('user_id', $booking->user_id)
                ->whereKeyNot($booking->id)
                ->overlapping($oldEnd, $newEnd)
                ->exists();
            if ($ownClash) {
                return [BookingExtension::STATUS_REJECTED, 'You have another booking at that time.'];
            }

            $booking->end_at = $newEnd;
            $booking->save();

            return [BookingExtension::STATUS_APPROVED,
                "Extended! Your booking now ends at {$this->time($newEnd)}."];
        });

        $extension = BookingExtension::create([
            'booking_id' => $booking->id,
            'requested_end_at' => $newEnd,
            'status' => $status,
            'requested_at' => $now,
        ]);

        return response()->json([
            'message' => $message,
            'extension' => [
                'id' => $extension->id,
                'status' => $status,
                'requested_end_time' => $this->time($newEnd, 'H:i'),
            ],
            'booking' => BookingController::payload($booking->fresh('room')),
        ], $status === BookingExtension::STATUS_APPROVED ? 200 : 409);
    }

    private function time(Carbon $time, string $format = 'g:i A'): string
    {
        return $time->copy()->setTimezone(self::TZ)->format($format);
    }

    private function fail(string $message, int $status = 422): JsonResponse
    {
        return response()->json(['message' => $message], $status);
    }
}