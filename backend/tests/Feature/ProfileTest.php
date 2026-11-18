<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

function pfStudent(array $extra = []): User
{
    $user = User::create(array_merge([
        'name' => 'Ariana Arissa Binti Azri',
        'email' => 'ariana@graduate.utm.my',
        'password' => 'Password123',
        'student_id' => 'A25CS0045',
    ], $extra));
    $user->role = 'student';
    $user->save();

    return $user;
}

function pfValid(array $overrides = []): array
{
    return array_merge([
        'name' => 'Ariana Arissa Binti Azri',
        'student_id' => 'A25CS0045',
        'programme' => 'Bachelor of Computer Science (Software Engineering)',
        'year_of_study' => 2,
        'campus' => 'jb',
    ], $overrides);
}

test('login and me return the profile fields from the database', function () {
    pfStudent(['programme' => 'Bachelor of Computer Science (Data Engineering)', 'year_of_study' => 3, 'campus' => 'kl']);

    $token = test()->postJson('/api/auth/login', ['email' => 'ariana@graduate.utm.my', 'password' => 'Password123'])
        ->assertOk()
        ->assertJsonPath('user.student_id', 'A25CS0045')
        ->assertJsonPath('user.programme', 'Bachelor of Computer Science (Data Engineering)')
        ->assertJsonPath('user.year_of_study', 3)
        ->assertJsonPath('user.campus', 'kl')
        ->json('token');

    test()->withToken($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('user.year_of_study', 3);
});

test('guests cannot change a profile', function () {
    test()->putJson('/api/profile', pfValid())->assertUnauthorized();
});

test('a student can save their programme, year and campus', function () {
    $user = pfStudent();
    Sanctum::actingAs($user);

    test()->putJson('/api/profile', pfValid(['name' => '  Ariana   Arissa Binti Azri ', 'campus' => 'kl']))
        ->assertOk()
        ->assertJsonPath('user.name', 'Ariana Arissa Binti Azri')
        ->assertJsonPath('user.programme', 'Bachelor of Computer Science (Software Engineering)')
        ->assertJsonPath('user.year_of_study', 2)
        ->assertJsonPath('user.campus', 'kl');

    $user->refresh();
    expect($user->year_of_study)->toBe(2);
    expect($user->campus)->toBe('kl');
});

test('the matric number cannot be changed once it is set', function () {
    Sanctum::actingAs(pfStudent());

    test()->putJson('/api/profile', pfValid(['student_id' => 'A22EC0123']))
        ->assertStatus(422)
        ->assertJsonPath('message', 'Your matric number can only be changed by library staff.');

    expect(User::first()->student_id)->toBe('A25CS0045');
});

test('a student without a matric number can add one, but not someone else\'s', function () {
    $other = User::create(['name' => 'Ben', 'email' => 'ben@graduate.utm.my', 'password' => 'Password123', 'student_id' => 'A22EC0123']);
    $user = pfStudent(['student_id' => null]);
    Sanctum::actingAs($user);

    test()->putJson('/api/profile', pfValid(['student_id' => 'A22EC0123']))
        ->assertStatus(422)
        ->assertJsonPath('message', 'That matric number is already used by another account.');

    test()->putJson('/api/profile', pfValid(['student_id' => 'a24cs0099']))
        ->assertOk()
        ->assertJsonPath('user.student_id', 'A24CS0099');
});

test('bad profile values are rejected with a clear message', function () {
    Sanctum::actingAs(pfStudent());

    test()->putJson('/api/profile', pfValid(['year_of_study' => 7]))
        ->assertStatus(422)->assertJsonPath('message', 'Choose your year of study.');
    test()->putJson('/api/profile', pfValid(['campus' => 'penang']))
        ->assertStatus(422)->assertJsonPath('message', 'Choose your campus.');
    test()->putJson('/api/profile', pfValid(['programme' => 'X']))
        ->assertStatus(422)->assertJsonPath('message', 'Enter your programme.');
});