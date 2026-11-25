<?php

namespace App\Http\Controllers;

use App\Services\RoomProblems;
use Illuminate\Http\JsonResponse;

/**
 * Browse Rooms: known problems per room type.
 *
 *   GET /api/room-notices  ->  { window_days, notices: { discussion: [{room_code, label, count, recurring, urgent, ...}] } }
 *
 * Only rooms and categories are shown, never the students' descriptions or names.
 */
class RoomNoticeController extends Controller
{
    public function __invoke(RoomProblems $problems): JsonResponse
    {
        return response()->json([
            'window_days' => RoomProblems::WINDOW_DAYS,
            'notices' => (object) $problems->byRoomType(),
        ]);
    }
}