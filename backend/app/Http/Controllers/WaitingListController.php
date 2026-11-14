<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Room;
use App\Models\WaitingList;
use App\Models\WaitingListOffer;
use App\Services\WaitingListService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Waiting list for students (frontend: WaitingList.jsx).
 *
 *   GET  /api/waiting-list/mine
 *   POST /api/waiting-list                  { room_type, date, start_time, duration }
 *   POST /api/waiting-list/{entry}/accept   accept the room you were offered
 *   POST /api/waiting-list/{entry}/leave    leave the queue, or decline the offer
 *
 * The rules themselves live in App\Services\WaitingListService.
 */
class WaitingListController extends Controller
{
    private const TZ = WaitingListService::TZ;

    public function __construct(private WaitingListService $service)
    {
    }

    /* ------------------------------------------------------------------
     | GET /api/waiting-list/mine
     * ------------------------------------------------------------------ */
    public function mine(Request $request): JsonResponse
    {
        // Apply the rules first, so the page is correct even if the
        // scheduler isn't running (e.g. on a laptop during development).
        $this->service->process();

        $userId = $request->user()->id;

        $active = WaitingList::where('user_id', $userId)
            ->active()
            ->orderBy('joined_at')
            ->get();

        $recent = WaitingList::where('user_id', $userId)
            ->whereNotIn('status', WaitingList::ACTIVE_STATUSES)
            ->where('joined_at', '>=', $this->toDb(Carbon::now()->subDays(7)))
            ->orderByDesc('joined_at')
            ->limit(10)
            ->get();

        return response()->json([
            'server_time' => Carbon::now(self::TZ)->toIso8601String(),
            'rules' => [
                'check_in_minutes' => WaitingListService::CHECK_IN_GRACE_MINUTES,
                'offer_minutes' => WaitingListService::OFFER_MINUTES,
                'max_requests' => WaitingListService::MAX_ACTIVE_PER_STUDENT,
            ],
            'entries' => $active->concat($recent)->map(fn ($entry) => $this->payload($entry))->values(),
        ]);
    }

    /* ------------------------------------------------------------------
     | POST /api/waiting-list   { room_type, date, start_time, duration }
     * ------------------------------------------------------------------ */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'room_type' => ['required', 'string'],
            'date' => ['required', 'date_format:Y-m-d'],
            'start_time' => ['required', 'date_format:H:i'],
            'duration' => ['required', 'integer'],
        ]);

        $type = $data['room_type'];
        $group = BookingController::bookableGroup($type);
        $duration = (int) $data['duration'];
        $user = $request->user();
        $now = Carbon::now(self::TZ);

        $start = Carbon::createFromFormat('Y-m-d H:i', "{$data['date']} {$data['start_time']}", self::TZ);
        $end = $start->copy()->addHours($duration);

        if ($error = BookingController::checkDay($start->copy()->startOfDay())) {
            return $this->fail($error);
        }
        if (! in_array($duration, BookingController::durationsFor($type), true)
            || ! in_array((int) $start->format('G'), BookingController::slotStarts($type, $duration), true)
            || $start->minute !== 0) {
            return $this->fail('That time slot is not available for this room. Please pick one from the list.');
        }
        if ($end->lessThanOrEqualTo($now->copy()->addMinutes(WaitingListService::MIN_MINUTES_LEFT))) {
            return $this->fail('That time slot is over or almost over. Please choose a later one.');
        }

        // Before the slot starts you can still book a free room directly,
        // so the waiting list is only for slots that are full.
        if ($start->greaterThan($now) && $this->freeRooms($type, $start, $end) > 0) {
            return $this->fail("A room in {$group['name']} is still free at this time. Book it from Browse Rooms instead.");
        }

        $hasBooking = Booking::active()
            ->where('user_id', $user->id)
            ->overlapping($this->toDb($start), $this->toDb($end))
            ->exists();
        if ($hasBooking) {
            return $this->fail('You already have a booking at that time.');
        }

        $alreadyQueued = WaitingList::active()
            ->where('user_id', $user->id)
            ->where('room_type', $type)
            ->where('wanted_start', '<', $this->toDb($end))
            ->where('wanted_end', '>', $this->toDb($start))
            ->exists();
        if ($alreadyQueued) {
            return $this->fail("You're already on the waiting list for {$group['name']} at this time.");
        }

        $activeCount = WaitingList::active()->where('user_id', $user->id)->count();
        if ($activeCount >= WaitingListService::MAX_ACTIVE_PER_STUDENT) {
            return $this->fail('You can be on at most '.WaitingListService::MAX_ACTIVE_PER_STUDENT
                .' waiting lists at once. Leave one to join another.');
        }

        $entry = WaitingList::create([
            'user_id' => $user->id,
            'room_type' => $type,
            'room_id' => null, // any room of this type
            'wanted_start' => $this->toDb($start),
            'wanted_end' => $this->toDb($end),
            'party_size' => 1,
            'joined_at' => $this->toDb(Carbon::now()),
            'status' => WaitingList::STATUS_WAITING,
        ]);

        // If a room is already free (e.g. after a no-show), offer it straight away.
        $this->service->offerFreeRooms();

        return response()->json(['entry' => $this->payload($entry->fresh())], 201);
    }

    /* ------------------------------------------------------------------
     | POST /api/waiting-list/{waitingList}/accept
     * ------------------------------------------------------------------ */
    public function accept(Request $request, WaitingList $waitingList): JsonResponse
    {
        if ($denied = $this->denyIfNotOwner($request, $waitingList)) {
            return $denied;
        }

        $result = $this->service->accept($waitingList);

        if (is_string($result)) {
            return $this->fail($result, 409);
        }

        return response()->json([
            'entry' => $this->payload($waitingList->fresh()),
            'booking' => [
                'id' => $result->id,
                'reference' => $result->reference,
                'room_name' => $result->room?->room_name,
                'start_at' => $result->start_at->copy()->setTimezone(self::TZ)->toIso8601String(),
                'end_at' => $result->end_at->copy()->setTimezone(self::TZ)->toIso8601String(),
                'status' => $result->status,
            ],
        ]);
    }

    /* ------------------------------------------------------------------
     | POST /api/waiting-list/{waitingList}/leave
     * ------------------------------------------------------------------ */
    public function leave(Request $request, WaitingList $waitingList): JsonResponse
    {
        if ($denied = $this->denyIfNotOwner($request, $waitingList)) {
            return $denied;
        }

        if ($error = $this->service->leave($waitingList)) {
            return $this->fail($error);
        }

        return response()->json(['entry' => $this->payload($waitingList->fresh())]);
    }

    /* ================================================================== */

    private function payload(WaitingList $entry): array
    {
        $start = $entry->wanted_start->copy()->setTimezone(self::TZ);
        $end = $entry->wanted_end->copy()->setTimezone(self::TZ);
        $isActive = in_array($entry->status, WaitingList::ACTIVE_STATUSES, true);

        $data = [
            'id' => $entry->id,
            'reference' => 'WL-'.str_pad((string) $entry->id, 4, '0', STR_PAD_LEFT),
            'room_type' => $entry->room_type,
            'room_group' => $this->service->groupName($entry->room_type),
            'date' => $start->format('Y-m-d'),
            'start_time' => $start->format('H:i'),
            'end_time' => $end->format('H:i'),
            'wanted_start' => $start->toIso8601String(),
            'wanted_end' => $end->toIso8601String(),
            'joined_at' => $entry->joined_at?->copy()->setTimezone(self::TZ)->toIso8601String(),
            'status' => $entry->status,
            'position' => $isActive ? $this->service->position($entry) : null,
            'line_size' => $isActive ? $this->service->lineSize($entry) : null,
            'offer' => null,
            'booking' => null,
        ];

        if ($entry->status === WaitingList::STATUS_OFFERED && ($offer = $this->service->pendingOffer($entry))) {
            $data['offer'] = [
                'id' => $offer->id,
                'expires_at' => $offer->expires_at->copy()->setTimezone(self::TZ)->toIso8601String(),
                'room_name' => $offer->booking?->room?->room_name,
                'room_code' => $offer->booking?->room?->room_code,
                'location' => $offer->booking?->room?->location,
                'start_time' => $offer->booking?->start_at->copy()->setTimezone(self::TZ)->format('H:i'),
                'end_time' => $offer->booking?->end_at->copy()->setTimezone(self::TZ)->format('H:i'),
            ];
        }

        if ($entry->status === WaitingList::STATUS_FULFILLED) {
            $accepted = WaitingListOffer::with('booking.room')
                ->where('waiting_list_entry_id', $entry->id)
                ->where('status', WaitingListOffer::STATUS_ACCEPTED)
                ->latest('id')
                ->first();

            if ($booking = $accepted?->booking) {
                $data['booking'] = [
                    'id' => $booking->id,
                    'reference' => $booking->reference,
                    'room_name' => $booking->room?->room_name,
                    'start_time' => $booking->start_at->copy()->setTimezone(self::TZ)->format('H:i'),
                    'end_time' => $booking->end_at->copy()->setTimezone(self::TZ)->format('H:i'),
                    'status' => $booking->status,
                ];
            }
        }

        return $data;
    }

    /** How many rooms of this type are free for the whole time. */
    private function freeRooms(string $type, Carbon $start, Carbon $end): int
    {
        $roomIds = Room::where('room_type', $type)->where('status', 'active')->pluck('id');

        $busy = Booking::active()
            ->whereIn('room_id', $roomIds)
            ->overlapping($this->toDb($start), $this->toDb($end))
            ->distinct()
            ->count('room_id');

        return max(0, $roomIds->count() - $busy);
    }

    private function denyIfNotOwner(Request $request, WaitingList $entry): ?JsonResponse
    {
        if ((int) $entry->user_id !== (int) $request->user()->id) {
            return response()->json(['message' => 'This waiting-list request does not belong to you.'], 403);
        }

        return null;
    }

    private function toDb(Carbon $time): Carbon
    {
        return $time->copy()->setTimezone(config('app.timezone'));
    }

    private function fail(string $message, int $status = 422): JsonResponse
    {
        return response()->json(['message' => $message], $status);
    }
}