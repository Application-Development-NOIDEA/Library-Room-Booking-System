<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Room;
use App\Models\User;
use App\Models\WaitingList;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification;
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
        $this->travelTo('2026-11-12 09:00:00');

        $student = User::factory()->create(['name' => 'Aina Sofea']);
        $other = User::factory()->create();

        $carrel1 = Room::create(['name' => 'Carrel Room 01', 'type' => 'carrel']);
        $carrel8 = Room::create(['name' => 'Carrel Room 08', 'type' => 'carrel']);
        $discussion = Room::create(['name' => 'Discussion Room 01', 'type' => 'discussion']);
        Room::create(['name' => 'Meeting Room 01', 'type' => 'meeting', 'is_active' => false]);

        // Student's bookings: one upcoming x2, one finished, one cancelled
        $later = $this->book($student, $carrel8, '2026-11-13 14:00', '2026-11-13 16:00');
        $sooner = $this->book($student, $discussion, '2026-11-12 10:00', '2026-11-12 12:00');
        $this->book($student, $carrel1, '2026-11-11 10:00', '2026-11-11 12:00', 'completed');
        $this->book($student, $carrel1, '2026-11-14 10:00', '2026-11-14 12:00', 'cancelled');

        // Someone else is using Carrel 01 right now
        $this->book($other, $carrel1, '2026-11-12 08:00', '2026-11-12 10:00', 'checked_in');

        // Queue for the discussion room: other first, then the student
        WaitingList::create(['user_id' => $other->id, 'room_id' => $discussion->id]);
        $this->travel(1)->minutes();
        WaitingList::create(['user_id' => $student->id, 'room_id' => $discussion->id]);

        $student->notify(new class extends Notification {
            public function via(): array { return ['database']; }
            public function toArray(): array
            {
                return ['tone' => 'gold', 'title' => 'Booking confirmed', 'text' => 'Your QR code is ready.'];
            }
        });

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
            ['type' => 'Meeting', 'free' => 0, 'total' => 0],
        ]);

        $response->assertJsonCount(1, 'notifications');
        $response->assertJsonPath('notifications.0.title', 'Booking confirmed');
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

    private function book(User $user, Room $room, string $start, string $end, string $status = 'confirmed'): Booking
    {
        return Booking::create([
            'user_id' => $user->id,
            'room_id' => $room->id,
            'start_time' => $start,
            'end_time' => $end,
            'status' => $status,
        ]);
    }
}