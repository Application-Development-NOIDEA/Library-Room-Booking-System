<?php

use App\Mail\ResetPasswordMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

uses(RefreshDatabase::class);

beforeEach(fn () => Mail::fake());
afterEach(fn () => Carbon::setTestNow());

function fpStudent(): User
{
    $user = User::create([
        'name' => 'Aina',
        'email' => 'aina@graduate.utm.my',
        'password' => 'Password123',
    ]);
    $user->role = 'student';
    $user->save();

    return $user;
}

/** Ask for a reset link and return the token from the email. */
function fpRequestToken(string $email = 'aina@graduate.utm.my'): string
{
    test()->postJson('/api/auth/forgot-password', ['email' => $email])->assertOk();

    $token = null;
    Mail::assertSent(ResetPasswordMail::class, function (ResetPasswordMail $mail) use ($email, &$token) {
        parse_str((string) parse_url($mail->link, PHP_URL_QUERY), $query);
        $token = $query['token'] ?? null;

        return $mail->hasTo($email) && str_contains($mail->link, '/reset-password?token=');
    });

    return $token;
}

test('a registered student gets a reset email', function () {
    fpStudent();

    expect(fpRequestToken())->toHaveLength(64);
});

test('an unknown email gets the same answer but no email', function () {
    test()->postJson('/api/auth/forgot-password', ['email' => 'nobody@graduate.utm.my'])
        ->assertOk()
        ->assertJsonPath('message', 'If that email is registered, a reset link has been sent.');

    Mail::assertNothingSent();
});

test('the link resets the password once and signs out other devices', function () {
    $aina = fpStudent();
    $aina->createToken('old-phone');
    $token = fpRequestToken();

    test()->postJson('/api/auth/reset-password', ['token' => $token, 'password' => 'NewPass2026'])
        ->assertOk();

    expect($aina->tokens()->count())->toBe(0);
    test()->postJson('/api/auth/login', ['email' => 'aina@graduate.utm.my', 'password' => 'Password123'])->assertUnauthorized();
    test()->postJson('/api/auth/login', ['email' => 'aina@graduate.utm.my', 'password' => 'NewPass2026'])->assertOk();

    // Same link again: no longer valid
    test()->postJson('/api/auth/reset-password', ['token' => $token, 'password' => 'Another2026'])
        ->assertStatus(400);
});

test('the link stops working after 60 minutes', function () {
    fpStudent();
    $token = fpRequestToken();

    Carbon::setTestNow(now()->addMinutes(61));

    test()->postJson('/api/auth/reset-password', ['token' => $token, 'password' => 'NewPass2026'])
        ->assertStatus(400)
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'expired'));
});

test('weak passwords are rejected', function () {
    fpStudent();
    $token = fpRequestToken();

    test()->postJson('/api/auth/reset-password', ['token' => $token, 'password' => 'short1'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Your new password needs at least 8 characters.');
    test()->postJson('/api/auth/reset-password', ['token' => $token, 'password' => 'onlyletters'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Your new password needs at least one letter and one number.');
});