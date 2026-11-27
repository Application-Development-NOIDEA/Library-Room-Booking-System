<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** The email copy of a notification (waiting-list offer, no-show, ...). */
class NotificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $name,
        public string $title,
        public string $text,
        public ?string $buttonLabel,
        public string $link,
        public bool $urgent = false,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'PSZ Room Booking: '.$this->title);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.notification');
    }
}