<?php

namespace Database\Seeders;

use App\Models\Room;
use Illuminate\Database\Seeder;

class RoomSeeder extends Seeder
{
    public function run(): void
    {
        $rooms = [];

        for ($i = 1; $i <= 69; $i++) {
            $rooms[] = [sprintf('CARREL-%02d', $i), "Carrel $i", 'carrel', 1];
        }
        for ($i = 1; $i <= 10; $i++) {
            $rooms[] = [sprintf('DISC-%02d', $i), "Discussion Room $i", 'discussion', 6];
        }

        $rooms = array_merge($rooms, [
            ['SEMINAR-3', 'Seminar Room 3', 'seminar', 130],
            ['VIEWING', 'Viewing Room', 'viewing', 50],
            ['ISL', 'Information Searching Laboratory', 'lab', 40],
            ['STUDY-24H', '24-Hour Study Room', 'study_24h', 0],
            ['LOBBY', 'Lobby Area & Foyer Area', 'lobby', 0],
            ['LOUNGE', 'Library Lounge', 'lounge', 0],
            ['EXHIBITION', 'Exhibition Area', 'exhibition', 0],
        ]);

        foreach ($rooms as [$code, $name, $type, $capacity]) {
            Room::updateOrCreate(
                ['room_code' => $code],
                [
                    'room_name' => $name,
                    'room_type' => $type,
                    'capacity' => $capacity,
                    'status' => 'active',
                ]
            );
        }
    }
}