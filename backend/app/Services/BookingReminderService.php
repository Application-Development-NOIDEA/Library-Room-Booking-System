<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\UserNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class BookingReminderService
{
    private const TZ = 'Asia/Kuala_Lumpur';

    public function send(bool $dryRun = false): array
    {
        return [
            'start' => $this->sendFor(
                'booking_start_reminder',
                'start_at',
                30,
                [Booking::STATUS_CONFIRMED],
                $dryRun
            ),

            'checkout' => $this->sendFor(
                'booking_checkout_reminder',
                'end_at',
                15,
                [Booking::STATUS_CHECKED_IN],
                $dryRun
            ),
        ];
    }

    private function sendFor(
        string $type,
        string $timeColumn,
        int $minutes,
        array $statuses,
        bool $dryRun
    ): int {
        $now = now();

        $from = $now->copy()->addMinutes($minutes - 1);
        $to = $now->copy()->addMinutes($minutes + 1);

        $bookingIds = Booking::query()
            ->whereIn('status', $statuses)
            ->where($timeColumn, '>=', $from)
            ->where($timeColumn, '<', $to)
            ->pluck('id');

        $count = 0;

        foreach ($bookingIds as $id) {
            $created = DB::transaction(function () use (
                $id,
                $type,
                $timeColumn,
                $minutes,
                $statuses,
                $from,
                $to,
                $dryRun
            ) {
                $booking = Booking::with('room')
                    ->whereKey($id)
                    ->lockForUpdate()
                    ->first();

                if (
                    !$booking ||
                    !in_array($booking->status, $statuses, true)
                ) {
                    return false;
                }

                $bookingTime = $booking->{$timeColumn};

                if (
                    $bookingTime->lessThan($from) ||
                    $bookingTime->greaterThanOrEqualTo($to)
                ) {
                    return false;
                }

                $prefix = "Booking {$booking->reference}:";

                // Prevent duplicate notifications.
                $alreadySent = UserNotification::query()
                    ->where('user_id', $booking->user_id)
                    ->where('message_type', $type)
                    ->where('message', 'like', $prefix . '%')
                    ->exists();

                if ($alreadySent) {
                    return false;
                }

                if ($dryRun) {
                    return true;
                }

                $room = $booking->room?->room_name
                    ?? 'your reserved room';

                $time = $bookingTime->copy()
                    ->setTimezone(self::TZ)
                    ->format('g:i A');

                if ($type === 'booking_start_reminder') {
                    $message = "{$prefix} Your booking for "
                        . "{$room} starts at {$time}. "
                        . "Please show your booking QR code "
                        . "at the library counter and check in "
                        . "within 15 minutes of your start time.";
                } else {
                    $message = "{$prefix} Your booking for "
                        . "{$room} ends at {$time}. "
                        . "Please prepare to check out and "
                        . "return the room key to library staff.";
                }

                // In-app notification (existing feature).
                UserNotification::create([
                    'user_id' => $booking->user_id,
                    'message_type' => $type,
                    'message' => $message,
                    'scheduled_at' => $bookingTime
                        ->copy()
                        ->subMinutes($minutes),
                    'delivered_at' => now(),
                    'is_read' => false,
                    'status' => 'sent',
                ]);

                return $message;
            });

            if ($created) {
                $count++;

                // Dry run does not create or email anything.
                if (!$dryRun && is_string($created)) {
                    $this->sendEmail(
                        (int) $id,
                        $type,
                        $created
                    );
                }
            }
        }

        return $count;
    }

    private function sendEmail(
        int $bookingId,
        string $type,
        string $message
    ): void {
        $booking = Booking::with('user')->find($bookingId);
        $email = $booking?->user?->email;

        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Log::warning('Booking reminder email not sent: invalid address', [
                'booking_id' => $bookingId,
                'type' => $type,
            ]);
            return;
        }

        $subject = $type === 'booking_start_reminder'
            ? 'PSZ Library - Your Booking Starts in 30 Minutes'
            : 'PSZ Library - Checkout Reminder (15 Minutes)';

        try {
            Mail::raw(
                $message,
                function ($mail) use ($email, $subject) {
                    $mail->to($email)
                        ->subject($subject);
                }
            );

            Log::info('Booking reminder email accepted by mailer', [
                'booking_id' => $bookingId,
                'type' => $type,
            ]);
        } catch (\Throwable $e) {
            // Website notification remains available.
            Log::error('Booking reminder email failed', [
                'booking_id' => $bookingId,
                'type' => $type,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
