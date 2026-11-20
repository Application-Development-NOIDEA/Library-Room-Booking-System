<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

function pwUser(): User
{
    $user = User::create(['name' => 'Aina', 'email' => 'aina@graduate.utm.my', 'password' => 'Password123']);
    $user->role = 'student';
    $user->save();

    return $user;
}

function pwChange(string $token, array $fields)
{
    return test()->withToken($token)->putJson('/api/auth/password', $fields);
}

test('guests cannot change a password', function () {
    test()->putJson('/api/auth/password', [])->assertUnauthorized();
});

test('a student can change their password and sign in with it', function () {
    $user = pwUser();
    $token = $user->createToken('web')->plainTextToken;

    pwChange($token, [
        'current_password' => 'Password123',
        'password' => 'NewSecret2026',
        'password_confirmation' => 'NewSecret2026',
    ])->assertOk()->assertJsonPath('message', 'Password changed. Other devices have been signed out.');

    expect(Hash::check('NewSecret2026', $user->fresh()->password))->toBeTrue();

    test()->postJson('/api/auth/login', ['email' => 'aina@graduate.utm.my', 'password' => 'Password123'])->assertUnauthorized();
    test()->postJson('/api/auth/login', ['email' => 'aina@graduate.utm.my', 'password' => 'NewSecret2026'])->assertOk();
});

test('other devices are signed out but this one stays signed in', function () {
    $user = pwUser();
    $thisDevice = $user->createToken('web')->plainTextToken;
    $user->createToken('phone');
    $user->createToken('laptop');

    pwChange($thisDevice, [
        'current_password' => 'Password123',
        'password' => 'NewSecret2026',
        'password_confirmation' => 'NewSecret2026',
    ])->assertOk();

    expect($user->tokens()->count())->toBe(1);
    test()->withToken($thisDevice)->getJson('/api/auth/me')->assertOk();
});

test('wrong or weak passwords are rejected with a clear message', function () {
    $token = pwUser()->createToken('web')->plainTextToken;
    $base = ['current_password' => 'Password123', 'password' => 'NewSecret2026', 'password_confirmation' => 'NewSecret2026'];

    pwChange($token, array_merge($base, ['current_password' => 'nope']))
        ->assertStatus(422)->assertJsonPath('message', 'Your current password is incorrect.');
    pwChange($token, array_merge($base, ['password' => 'short1', 'password_confirmation' => 'short1']))
        ->assertStatus(422)->assertJsonPath('message', 'Your new password needs at least 8 characters.');
    pwChange($token, array_merge($base, ['password' => 'onlyletters', 'password_confirmation' => 'onlyletters']))
        ->assertStatus(422)->assertJsonPath('message', 'Your new password needs at least one letter and one number.');
    pwChange($token, array_merge($base, ['password_confirmation' => 'Different2026']))
        ->assertStatus(422)->assertJsonPath('message', 'The new passwords do not match.');
    pwChange($token, array_merge($base, ['password' => 'Password123', 'password_confirmation' => 'Password123']))
        ->assertStatus(422)->assertJsonPath('message', 'Choose a password different from your current one.');
});