<?php

namespace App\Services;

use App\Http\Controllers\RoomController;
use App\Models\Booking;
use App\Models\Room;
use App\Models\UserNotification;
use App\Models\WaitingList;
use App\Models\WaitingListOffer;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The waiting-list rules, in one place.
 *
 *  1. A booking that is not checked in within 15 minutes of its start
 *     becomes a no-show and its room is released.
 *  2. A released room is offered to the first student in the queue for that
 *     room type and time. The room is held for them for 10 minutes.
 *  3. If they don't accept in time, the offer expires and the room goes to
 *     the next student in the queue.
 *
 * process() applies all of this. It runs every minute from the scheduler
 * (routes/console.php) and also straight after anything that frees a room.
 */
class WaitingListService
{
    public const TZ = 'Asia/Kuala_Lumpur';

    /** Minutes a student has to check in after their booking starts. */
    public const CHECK_IN_GRACE_MINUTES = 15;

    /** Minutes a student has to accept an offered room. */
    public const OFFER_MINUTES = 10;

    /** Don't offer (or keep queuing for) a slot with less time than this left. */
    public const MIN_MINUTES_LEFT = 15;

    /** Waiting-list requests one student can have at the same time. */
    public const MAX_ACTIVE_PER_STUDENT = 3;

    /** Run every rule once. Returns how many things changed, for the console output. */
    public function process(?Carbon $now = null): array
    {
        $now = $this->clock($now);

        return [
            'no_shows' => $this->markNoShows($now),
            'expired_offers' => $this->expireOffers($now),
            'expired_requests' => $this->expireStaleRequests($now),
            'offers' => $this->offerFreeRooms($now),
        ];
    }

    /* ------------------------------------------------------------------
     | Rule 1: no check-in within 15 minutes -> no-show, room released
     * ------------------------------------------------------------------ */
    public function markNoShows(?Carbon $now = null): int
{
    $now = $this->clock($now);
    $deadline = $now->copy()->subMinutes(self::CHECK_IN_GRACE_MINUTES);

    // Only bookings still waiting for staff to check them in. A booking staff
    // has checked in is 'checked_in', so it is never picked up here.
    $ids = Booking::where('status', Booking::STATUS_CONFIRMED)
        ->where('start_at', '<=', $deadline)
        ->orderBy('id')
        ->pluck('id');

    $released = 0;
    foreach ($ids as $id) {
        if ($this->releaseNoShow((int) $id, $deadline, $now)) {
            $released++;
        }
    }

    return $released;
}

/**
 * Release one no-show booking. Safe to call twice (or from two overlapping
 * scheduler runs): the row is locked and re-checked, so only the first call
 * changes it, logs it and notifies the student. Returns false if it did nothing.
 */
private function releaseNoShow(int $bookingId, Carbon $deadline, Carbon $now): bool
{
    $booking = DB::transaction(function () use ($bookingId, $deadline) {
        $booking = Booking::with('room:id,room_name')->whereKey($bookingId)->lockForUpdate()->first();

        // Staff checked them in, or someone cancelled it, since we looked.
        if (! $booking
            || $booking->status !== Booking::STATUS_CONFIRMED
            || $booking->start_at->greaterThan($deadline)) {
            return null;
        }

        $booking->status = Booking::STATUS_NO_SHOW;
        $booking->save();

        return $booking;
    });

    if (! $booking) {
        return false;
    }

    Log::info('Booking auto-cancelled as no-show and room released', [
        'booking_id' => $booking->id,
        'reference' => $booking->reference,
        'user_id' => $booking->user_id,
        'room_id' => $booking->room_id,
        'start_at' => $booking->start_at->toIso8601String(),
        'grace_minutes' => self::CHECK_IN_GRACE_MINUTES,
        'released_at' => $now->toIso8601String(),
    ]);

    $this->notify(
        $booking->user_id,
        'booking_no_show',
        "Your booking for {$this->roomName($booking)} at {$this->time($booking->start_at)} was cancelled because "
            .'you did not check in within '.self::CHECK_IN_GRACE_MINUTES.' minutes.'
    );

    return true;
}
    /* ------------------------------------------------------------------
     | Rule 3: offer not accepted in 10 minutes -> expired, room released
     * ------------------------------------------------------------------ */
    public function expireOffers(?Carbon $now = null): int
    {
        $now = $this->clock($now);
        $offers = WaitingListOffer::with(['entry', 'booking.room:id,room_name'])
            ->where('status', WaitingListOffer::STATUS_PENDING)
            ->where('expires_at', '<=', $now)
            ->get();

        foreach ($offers as $offer) {
            DB::transaction(function () use ($offer) {
                $offer->status = WaitingListOffer::STATUS_EXPIRED;
                $offer->save();

                if ($offer->booking && $offer->booking->status === Booking::STATUS_HELD) {
                    $offer->booking->status = Booking::STATUS_CANCELLED;
                    $offer->booking->save();
                }

                if ($offer->entry && $offer->entry->status === WaitingList::STATUS_OFFERED) {
                    $offer->entry->status = WaitingList::STATUS_EXPIRED;
                    $offer->entry->save();
                }
            });

            if ($offer->entry) {
                $this->notify(
                    $offer->entry->user_id,
                    'waiting_list_offer_expired',
                    "The offer for {$this->roomName($offer->booking)} expired because it wasn't accepted within "
                        .self::OFFER_MINUTES.' minutes, so it went to the next person in the queue.'
                );
            }
        }

        return $offers->count();
    }

    /** Requests whose time is (almost) over can never be served. */
    public function expireStaleRequests(?Carbon $now = null): int
    {
        $now = $this->clock($now);
        return WaitingList::where('status', WaitingList::STATUS_WAITING)
            ->where('wanted_end', '<=', $now->copy()->addMinutes(self::MIN_MINUTES_LEFT))
            ->update(['status' => WaitingList::STATUS_EXPIRED]);
    }

    /* ------------------------------------------------------------------
     | Rule 2: a free room goes to the first student in the queue
     * ------------------------------------------------------------------ */
    public function offerFreeRooms(?Carbon $now = null): int
    {
        $now = $this->clock($now);
        // Oldest request first, so the queue is fair.
        $entries = WaitingList::where('status', WaitingList::STATUS_WAITING)
            ->where('wanted_end', '>', $now->copy()->addMinutes(self::MIN_MINUTES_LEFT))
            ->orderBy('joined_at')
            ->orderBy('id')
            ->limit(100)
            ->get();

        $made = 0;
        foreach ($entries as $entry) {
            if ($this->tryOffer($entry, $now)) {
                $made++;
            }
        }

        return $made;
    }

    /** Hold a free room for this request, if there is one. */
    private function tryOffer(WaitingList $entry, Carbon $now): bool
    {
        // If the slot has already started, the offered booking starts now.
        $start = $entry->wanted_start->greaterThan($now) ? $entry->wanted_start->copy() : $now->copy();
        $end = $entry->wanted_end->copy();

        // The student already has a room at that time: nothing to offer.
        $alreadyBooked = Booking::active()
            ->where('user_id', $entry->user_id)
            ->overlapping($start, $end)
            ->exists();
        if ($alreadyBooked) {
            return false;
        }

        $offer = DB::transaction(function () use ($entry, $start, $end, $now) {
            // Re-read the request inside the lock: another run may have served it.
            $fresh = WaitingList::whereKey($entry->id)->lockForUpdate()->first();
            if (! $fresh || $fresh->status !== WaitingList::STATUS_WAITING) {
                return null;
            }

            $rooms = Room::where('room_type', $fresh->room_type)
                ->where('status', 'active')
                ->when($fresh->room_id, fn ($q) => $q->whereKey($fresh->room_id))
                ->where(fn ($q) => $q->where('capacity', '>=', $fresh->party_size)->orWhere('capacity', '<=', 0))
                ->orderBy('id')
                ->lockForUpdate()
                ->get(['id', 'room_name']);

            if ($rooms->isEmpty()) {
                return null;
            }

            $busy = Booking::active()
                ->whereIn('room_id', $rooms->pluck('id'))
                ->overlapping($start, $end)
                ->pluck('room_id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $room = $rooms->first(fn ($r) => ! in_array((int) $r->id, $busy, true));
            if (! $room) {
                return null;
            }

            $booking = Booking::create([
                'user_id' => $fresh->user_id,
                'room_id' => $room->id,
                'start_at' => $start,
                'end_at' => $end,
                'status' => Booking::STATUS_HELD,
            ]);

            $fresh->status = WaitingList::STATUS_OFFERED;
            $fresh->save();

            return WaitingListOffer::create([
                'waiting_list_entry_id' => $fresh->id,
                'booking_id' => $booking->id,
                'offered_at' => $now,
                'expires_at' => $now->copy()->addMinutes(self::OFFER_MINUTES),
                'status' => WaitingListOffer::STATUS_PENDING,
            ])->setRelation('booking', $booking->setRelation('room', $room));
        });

        if (! $offer) {
            return false;
        }

        $this->notify(
            $entry->user_id,
            'waiting_list_offer',
            "{$this->roomName($offer->booking)} is free for {$this->time($start)} – {$this->time($end)}. "
                .'Accept it on the Waiting List page within '.self::OFFER_MINUTES.' minutes.'
        );

        return true;
    }

    /* ------------------------------------------------------------------
     | Student actions
     * ------------------------------------------------------------------ */

    /**
     * Accept the pending offer for this request.
     * Returns the confirmed booking, or an error message.
     */
    public function accept(WaitingList $entry, ?Carbon $now = null): Booking|string
    {
        $now = $this->clock($now);

        if ($entry->status !== WaitingList::STATUS_OFFERED) {
            return 'There is no room waiting for you on this request.';
        }

        $offer = $this->pendingOffer($entry);
        if (! $offer || ! $offer->booking || $offer->booking->status !== Booking::STATUS_HELD) {
            return 'There is no room waiting for you on this request.';
        }

        if ($offer->expires_at->lessThanOrEqualTo($now)) {
            $this->process($now);

            return 'Sorry, this offer has expired and was passed to the next person.';
        }

        $booking = $offer->booking;

        $clash = Booking::active()
            ->where('user_id', $entry->user_id)
            ->whereKeyNot($booking->id)
            ->overlapping($booking->start_at, $booking->end_at)
            ->exists();
        if ($clash) {
            return 'You already have another booking at this time. Cancel it first, or decline this offer.';
        }

        DB::transaction(function () use ($entry, $offer, $booking, $now) {
            // The 15-minute check-in clock starts when you accept, not before.
            if ($booking->start_at->lessThan($now)) {
                $booking->start_at = $now->copy()->startOfMinute();
            }
            $booking->status = Booking::STATUS_CONFIRMED;
            $booking->save();

            $offer->status = WaitingListOffer::STATUS_ACCEPTED;
            $offer->save();

            $entry->status = WaitingList::STATUS_FULFILLED;
            $entry->save();
        });

        return $booking->fresh('room');
    }

    /** Leave the queue, or decline the room you were offered. */
    public function leave(WaitingList $entry): ?string
    {
        if (! in_array($entry->status, WaitingList::ACTIVE_STATUSES, true)) {
            return 'This request is no longer active.';
        }

        $declined = false;

        DB::transaction(function () use ($entry, &$declined) {
            if ($entry->status === WaitingList::STATUS_OFFERED && ($offer = $this->pendingOffer($entry))) {
                $offer->status = WaitingListOffer::STATUS_DECLINED;
                $offer->save();

                if ($offer->booking && $offer->booking->status === Booking::STATUS_HELD) {
                    $offer->booking->status = Booking::STATUS_CANCELLED;
                    $offer->booking->save();
                }
                $declined = true;
            }

            $entry->status = WaitingList::STATUS_CANCELLED;
            $entry->save();
        });

        // A declined room goes straight to the next person.
        if ($declined) {
            $this->offerFreeRooms();
        }

        return null;
    }

    /* ------------------------------------------------------------------
     | Queue position
     * ------------------------------------------------------------------ */

    /**
     * People in the same queue: same room type, wanting an overlapping time,
     * and still waiting or holding an offer.
     */
    public function lineQuery(WaitingList $entry)
    {
        return WaitingList::active()
            ->where('room_type', $entry->room_type)
            ->where('wanted_start', '<', $entry->wanted_end)
            ->where('wanted_end', '>', $entry->wanted_start);
    }

    /** 1 = next in line. */
    public function position(WaitingList $entry): int
    {
        $ahead = $this->lineQuery($entry)
            ->where(function ($query) use ($entry) {
                $query->where('joined_at', '<', $entry->joined_at)
                    ->orWhere(function ($tie) use ($entry) {
                        $tie->where('joined_at', $entry->joined_at)->where('id', '<', $entry->id);
                    });
            })
            ->count();

        return $ahead + 1;
    }

    public function lineSize(WaitingList $entry): int
    {
        return $this->lineQuery($entry)->count();
    }

    /* ================================================================== */

    /** Current time in the database timezone (UTC), to the minute. */
    private function clock(?Carbon $now = null): Carbon
    {
        return ($now ?? now())->copy()->setTimezone(config('app.timezone'))->startOfMinute();
    }

    public function pendingOffer(WaitingList $entry): ?WaitingListOffer
    {
        return WaitingListOffer::with('booking.room')
            ->where('waiting_list_entry_id', $entry->id)
            ->where('status', WaitingListOffer::STATUS_PENDING)
            ->latest('id')
            ->first();
    }

    public function groupName(string $type): string
    {
        return RoomController::GROUPS[$type]['name'] ?? ucfirst(str_replace('_', ' ', $type));
    }

    private function roomName(?Booking $booking): string
    {
        return $booking?->room?->room_name ?? 'your room';
    }

    private function time(Carbon $time): string
    {
        return $time->copy()->setTimezone(self::TZ)->format('g:i A');
    }

    private function notify(int $userId, string $type, string $message): void
    {
        UserNotification::create([
            'user_id' => $userId,
            'message_type' => $type,
            'message' => $message,
            'delivered_at' => $this->clock(),
            'status' => 'sent',
        ]);
    }
}