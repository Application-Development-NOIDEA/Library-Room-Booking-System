<?php

namespace App\Services;

use App\Mail\NotificationMail;
use App\Models\UserNotification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Emails a copy of each new notification (registered in AppServiceProvider).
 * The bell in the website still works if the email fails.
 */
class NotificationMailer
{
    /** Booking reminders already send their own email (BookingReminderService). */
    private const SKIP = ['booking_start_reminder', 'booking_checkout_reminder'];

    private const EMAILS = [
        'booking_added_by_staff' => ['title' => 'Staff booked a room for you', 'button' => 'See my bookings', 'urgent' => false],
        'booking_changed_by_staff' => ['title' => 'Your booking was changed', 'button' => 'See my bookings', 'urgent' => false],
        'booking_cancelled_by_staff' => ['title' => 'Your booking was cancelled', 'button' => 'Book again', 'urgent' => true],
        'waiting_list_offer' => [
            'title' => 'A room is free for you',
            'button' => 'Accept the room',
            'urgent' => true,
        ],
        'waiting_list_offer_expired' => [
            'title' => 'Your room offer expired',
            'button' => 'Open the waiting list',
            'urgent' => false,
        ],
        'booking_no_show' => [
            'title' => 'Your booking was released',
            'button' => 'Book again',
            'urgent' => false,
        ],
    ];

    public function send(UserNotification $notification): void
    {
        $type = (string) $notification->message_type;
        if (in_array($type, self::SKIP, true)) {
            return;
        }

        $user = $notification->user;
        $email = $user?->email;
        if (! $email || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return;
        }

        $copy = self::EMAILS[$type] ?? ['title' => 'You have a new notification', 'button' => 'Open PSZ Room Booking', 'urgent' => false];

        try {
            Mail::to($email)->send(new NotificationMail(
                name: (string) $user->name,
                title: $copy['title'],
                text: (string) $notification->message,
                buttonLabel: $copy['button'],
                link: rtrim(env('FRONTEND_URL', 'http://localhost:5173'), '/'),
                urgent: $copy['urgent'],
            ));
        } catch (Throwable $e) {
            Log::warning('Notification email failed; the bell still has it.', [
                'notification_id' => $notification->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}