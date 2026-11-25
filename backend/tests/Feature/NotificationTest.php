<?php

use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(fn () => Carbon::setTestNow(Carbon::create(2026, 11, 26, 2, 0, 0, 'UTC')));
afterEach(fn () => Carbon::setTestNow());

function ntStudent(string $name = 'Aina'): User
{
    $user = User::create(['name' => $name, 'email' => uniqid('nt').'@graduate.utm.my', 'password' => 'Password123']);
    $user->role = 'student';
    $user->save();

    return $user;
}

function ntNotify(User $user, string $type, array $extra = []): UserNotification
{
    $n = new UserNotification(array_merge([
        'user_id' => $user->id,
        'message_type' => $type,
        'message' => "Message about $type.",
        'is_read' => false,
        'status' => 'sent',
    ], $extra));
    $n->created_at = $extra['created_at'] ?? now();
    $n->save();

    return $n;
}

test('guests cannot see notifications', function () {
    test()->getJson('/api/notifications')->assertUnauthorized();
});

test('students see their own notifications, newest first, with an unread count', function () {
    $aina = ntStudent();
    ntNotify($aina, 'booking_start_reminder', ['created_at' => now()->subHour(), 'is_read' => true]);
    ntNotify($aina, 'waiting_list_offer');
    ntNotify(ntStudent('Ben'), 'booking_no_show'); // not Aina's
    ntNotify($aina, 'booking_checkout_reminder', ['scheduled_at' => now()->addHour()]); // not due yet

    Sanctum::actingAs($aina);

    test()->getJson('/api/notifications')->assertOk()
        ->assertJsonPath('unread', 1)
        ->assertJsonCount(2, 'notifications')
        ->assertJsonPath('notifications.0.type', 'waiting_list_offer')
        ->assertJsonPath('notifications.0.title', 'A room is free for you')
        ->assertJsonPath('notifications.0.urgent', true)
        ->assertJsonPath('notifications.0.action.page', 'waiting-list')
        ->assertJsonPath('notifications.1.read', true);
});

test('a student can mark one, or all, as read', function () {
    $aina = ntStudent();
    $first = ntNotify($aina, 'waiting_list_offer');
    ntNotify($aina, 'booking_no_show');
    ntNotify($aina, 'booking_start_reminder');

    Sanctum::actingAs($aina);

    test()->postJson("/api/notifications/{$first->id}/read")->assertOk()
        ->assertJsonPath('notification.read', true)
        ->assertJsonPath('unread', 2);

    test()->postJson('/api/notifications/read-all')->assertOk()->assertJsonPath('marked', 2);
    expect(UserNotification::where('is_read', false)->count())->toBe(0);
});

test('you cannot mark someone else\'s notification', function () {
    $bens = ntNotify(ntStudent('Ben'), 'booking_no_show');
    Sanctum::actingAs(ntStudent());

    test()->postJson("/api/notifications/{$bens->id}/read")->assertForbidden();
    expect($bens->fresh()->is_read)->toBeFalse();
});