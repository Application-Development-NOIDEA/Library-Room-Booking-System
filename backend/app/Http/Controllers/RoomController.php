<?php

namespace App\Http\Controllers;

use App\Models\Room;

class RoomController extends Controller
{
    // How each room_type is shown on the Browse Rooms page
    private const GROUPS = [
        'carrel' => ['name' => 'Carrel Rooms', 'type' => 'Study', 'bookable' => true,
            'slot' => '4-hour slots', 'description' => 'Individual study carrels for quiet, focused work.'],
        'discussion' => ['name' => 'Discussion Rooms', 'type' => 'Discussion', 'bookable' => true,
            'slot' => 'Hourly slots', 'description' => 'Small rooms for group discussions and project meetings.'],
        'seminar' => ['name' => 'Seminar Room 3', 'type' => 'Meeting', 'bookable' => true,
            'slot' => 'Request a time slot', 'description' => 'Large room for seminars, talks and workshops.'],
        'viewing' => ['name' => 'Viewing Room', 'type' => 'Meeting', 'bookable' => true,
            'slot' => 'Request a time slot', 'description' => 'Room for presentations, screenings and group sessions.'],
        'lab' => ['name' => 'Information Searching Laboratory', 'type' => 'Study', 'bookable' => true,
            'slot' => 'Request a time slot', 'description' => 'Computer lab for research and information searching.'],
        'study_24h' => ['name' => '24-Hour Study Room', 'type' => 'Study', 'bookable' => false,
            'slot' => 'Open all day, no reservation', 'description' => 'Open around the clock for student study. Walk in anytime.'],
        'lobby' => ['name' => 'Lobby Area & Foyer Area', 'type' => 'Events', 'bookable' => false,
            'slot' => 'For training and official events', 'description' => 'Suitable for training sessions and official events.'],
        'lounge' => ['name' => 'Library Lounge', 'type' => 'Events', 'bookable' => false,
            'slot' => 'For events and gatherings', 'description' => 'Available for events and academic gatherings.'],
        'exhibition' => ['name' => 'Exhibition Area', 'type' => 'Events', 'bookable' => false,
            'slot' => 'Displays and exhibits', 'description' => 'Dedicated space for displays and historical exhibits.'],
    ];

    // GET /api/rooms
    public function index()
    {
        $groups = Room::where('status', 'active')->orderBy('id')->get()->groupBy('room_type');
        $result = [];

        foreach ($groups as $roomType => $items) {
            $meta = self::GROUPS[$roomType] ?? null;
            if (!$meta) {
                continue;
            }

            $capacity = (int) $items->first()->capacity;

            $result[] = [
                'id' => $roomType,
                'name' => $meta['name'],
                'type' => $meta['type'],
                'capacity' => $capacity > 0 ? $capacity : null,
                'total' => $items->count(),
                'bookable' => $meta['bookable'],
                'slot' => $meta['slot'],
                'description' => $meta['description'],
            ];
        }

        return response()->json($result);
    }

    // GET /api/rooms/{room}  (one individual room)
    public function show(Room $room)
    {
        return response()->json($room);
    }
}