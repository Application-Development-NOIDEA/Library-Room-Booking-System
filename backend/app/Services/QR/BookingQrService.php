<?php

namespace App\Services\QR;

use App\Services\WaitingListService;
use App\Models\Booking;
use App\Models\BookingCheckin;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class BookingQrService
{
    public const EARLY_CHECK_IN_MINUTES = 15;
    public const LATE_CHECK_OUT_MINUTES = 60;
    public const TOKEN_PATTERN = '/^[a-f0-9]{64}$/i';

    public function issue(Booking $booking): string
    {
        $token = bin2hex(random_bytes(32));
        $booking->qr_token_hash = self::hash($token);
        $booking->save();

        return $token;
    }

    public static function hash(string $token): string
    {
        return hash('sha256', strtolower($token));
    }

    public function findByToken(string $token): ?Booking
    {
        if (! preg_match(self::TOKEN_PATTERN, $token)) {
            return null;
        }

        return Booking::with(['room', 'user'])->where('qr_token_hash', self::hash($token))->first();
    }

    public function checkInOpensAt(Booking $booking): Carbon
    {
        return $booking->start_at->copy()->subMinutes(self::EARLY_CHECK_IN_MINUTES);
    }

    public function checkInDeadline(Booking $booking): Carbon
    {
        return $booking->start_at->copy()->addMinutes(WaitingListService::CHECK_IN_GRACE_MINUTES);
    }

    public function state(Booking $booking, ?Carbon $now = null): string
    {
        $now ??= Carbon::now();

        return match ($booking->status) {
            Booking::STATUS_CONFIRMED => match (true) {
                $now->lessThan($this->checkInOpensAt($booking)) => 'not_yet_open',
                $now->greaterThanOrEqualTo($this->checkInDeadline($booking))
                    || $now->greaterThanOrEqualTo($booking->end_at) => 'expired',
                default => 'check_in',
            },
            Booking::STATUS_CHECKED_IN => $now->lessThan($booking->end_at->copy()->addMinutes(self::LATE_CHECK_OUT_MINUTES))
                ? 'check_out'
                : 'expired',
            Booking::STATUS_CHECKED_OUT => 'used',
            default => 'expired',
        };
    }

    public function checkIn(Booking $booking, User $staff, ?Carbon $now = null): ?string
    {
        $now ??= Carbon::now();

        return DB::transaction(function () use ($booking, $staff, $now) {
            $b = Booking::whereKey($booking->id)->lockForUpdate()->first();

            if ($b->status === Booking::STATUS_NO_SHOW) {
                return 'This booking was already released as a no-show.';
            }
            if ($b->status !== Booking::STATUS_CONFIRMED) {
                return 'Only confirmed bookings can be checked in (this one is '.str_replace('_', ' ', $b->status).').';
            }
            if ($now->lessThan($this->checkInOpensAt($b))) {
                return 'Too early. Check-in opens '.self::EARLY_CHECK_IN_MINUTES.' minutes before the start time.';
            }
            if ($now->greaterThanOrEqualTo($b->end_at)) {
                return 'This booking has already ended.';
            }

            $b->status = Booking::STATUS_CHECKED_IN;
            $b->save();

            BookingCheckin::create([
                'booking_id' => $b->id,
                'checked_in_at' => $now,
                'checked_in_by' => $staff->id,
            ]);

            return null;
        });
    }

    public function checkOut(Booking $booking, User $staff, ?Carbon $now = null): ?string
    {
        $now ??= Carbon::now();

        return DB::transaction(function () use ($booking, $staff, $now) {
            $b = Booking::whereKey($booking->id)->lockForUpdate()->first();

            if ($b->status !== Booking::STATUS_CHECKED_IN) {
                return 'Only students who are checked in can be checked out.';
            }

            $b->status = Booking::STATUS_CHECKED_OUT;
            $b->save();

            $checkin = BookingCheckin::where('booking_id', $b->id)->latest('id')->first()
                ?? new BookingCheckin(['booking_id' => $b->id]);
            $checkin->checked_out_at = $now;
            $checkin->checked_out_by = $staff->id;
            $checkin->save();

            return null;
        });
    }

    public function times(Booking $booking): array
    {
        $checkin = $booking->relationLoaded('checkins')
            ? $booking->checkins->sortByDesc('id')->first()
            : BookingCheckin::where('booking_id', $booking->id)->latest('id')->first();
        $tz = WaitingListService::TZ;

        return [
            'checked_in_at' => $checkin?->checked_in_at?->copy()->setTimezone($tz)->toIso8601String(),
            'checked_out_at' => $checkin?->checked_out_at?->copy()->setTimezone($tz)->toIso8601String(),
        ];
    }

    public function status(Booking $booking): array
    {
        $tz = WaitingListService::TZ;

        return [
            'booking_id' => $booking->id,
            'reference' => $booking->reference,
            'status' => $booking->status,
            'qr_state' => $this->state($booking),
            'check_in_opens_at' => $this->checkInOpensAt($booking)->setTimezone($tz)->toIso8601String(),
            'check_in_deadline' => $this->checkInDeadline($booking)->setTimezone($tz)->toIso8601String(),
            'end_at' => $booking->end_at->copy()->setTimezone($tz)->toIso8601String(),
            ...$this->times($booking),
        ];
    }
}