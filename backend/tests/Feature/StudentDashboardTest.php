<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Room;
use App\Models\User;
use App\Models\UserNotification;
use App\Models\WaitingList;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StudentDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_cannot_see_the_dashboard(): void
    {
        $this->getJson('/api/student/dashboard')->assertUnauthorized();
    }

    public function test_dashboard_returns_the_students_data(): void
    {
        $this->travelTo('2026-11-12 09:00:00'); // UTC

        $student = User::factory()->create(['name' => 'Aina Sofea']);
        $other = User::factory()->create();

        $carrel1 = $this->room('CR-01', 'Carrel Room 01', 'carrel');
        $carrel8 = $this->room('CR-08', 'Carrel Room 08', 'carrel');
        $discussion = $this->room('DR-01', 'Discussion Room 01', 'discussion');
        $this->room('SR-03', 'Seminar Room 3', 'seminar', 'maintenance');

        // Student's bookings: two upcoming, one finished, one cancelled
        $later = $this->book($student, $carrel8, '2026-11-13 14:00', '2026-11-13 16:00');
        $sooner = $this->book($student, $discussion, '2026-11-12 10:00', '2026-11-12 12:00');
        $this->book($student, $carrel1, '2026-11-11 10:00', '2026-11-11 12:00', 'checked_out');
        $this->book($student, $carrel1, '2026-11-14 10:00', '2026-11-14 12:00', 'cancelled');

        // Someone else is using Carrel 01 right now
        $this->book($other, $carrel1, '2026-11-12 08:00', '2026-11-12 10:00', 'checked_in');

        // Queue for the discussion room: other first, then the student
        $this->queue($other, $discussion, '2026-11-12 08:30:00');
        $this->queue($student, $discussion, '2026-11-12 08:31:00');

        UserNotification::create([
            'user_id' => $student->id,
            'message_type' => 'booking_confirmed',
            'message' => 'Your QR code is ready.',
            'status' => 'sent',
        ]);

        Sanctum::actingAs($student);

        $response = $this->getJson('/api/student/dashboard')->assertOk();

        $response->assertJsonPath('user.name', 'Aina Sofea');

        // Only active, not-yet-ended bookings, soonest first
        $response->assertJsonCount(2, 'bookings');
        $response->assertJsonPath('bookings.0.id', $sooner->reference);
        $response->assertJsonPath('bookings.0.room', 'Discussion Room 01');
        $response->assertJsonPath('bookings.0.type', 'DISCUSSION ROOM');
        $response->assertJsonPath('bookings.1.id', $later->reference);

        $response->assertJsonPath('waiting', ['room' => 'Discussion Room 01', 'position' => 2]);

        $response->assertJsonPath('availability', [
            ['type' => 'Carrel', 'free' => 1, 'total' => 2],
            ['type' => 'Discussion', 'free' => 1, 'total' => 1],
            ['type' => 'Seminar', 'free' => 0, 'total' => 0],
            ['type' => 'Viewing', 'free' => 0, 'total' => 0],
            ['type' => 'Lab', 'free' => 0, 'total' => 0],
        ]);

        $response->assertJsonCount(1, 'notifications');
        $response->assertJsonPath('notifications.0.title', 'Booking Confirmed');
        $response->assertJsonPath('notifications.0.tone', 'gold');

        $response->assertJsonCount(3, 'rules');
    }

    public function test_waiting_is_null_when_not_in_a_queue(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/student/dashboard')
            ->assertOk()
            ->assertJsonPath('waiting', null)
            ->assertJsonPath('bookings', []);
    }

    private function room(string $code, string $name, string $type, string $status = 'active'): Room
    {
        return Room::create([
            'room_code' => $code,
            'room_name' => $name,
            'room_type' => $type,
            'capacity' => 6,
            'status' => $status,
        ]);
    }

    private function book(User $user, Room $room, string $start, string $end, string $status = 'confirmed'): Booking
    {
        return Booking::create([
            'user_id' => $user->id,
            'room_id' => $room->id,
            'start_at' => $start,
            'end_at' => $end,
            'status' => $status,
        ]);
    }

    private function queue(User $user, Room $room, string $joinedAt): WaitingList
    {
        return WaitingList::create([
            'user_id' => $user->id,
            'room_type' => $room->room_type,
            'room_id' => $room->id,
            'wanted_start' => '2026-11-12 13:00:00',
            'wanted_end' => '2026-11-12 15:00:00',
            'party_size' => 4,
            'joined_at' => $joinedAt,
        ]);
    }
}
