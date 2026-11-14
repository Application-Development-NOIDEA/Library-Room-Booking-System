<?php

use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    Room::insert([
        ['room_code' => 'CARREL-01', 'room_name' => 'Carrel 1', 'room_type' => 'carrel', 'capacity' => 1, 'status' => 'active'],
        ['room_code' => 'CARREL-02', 'room_name' => 'Carrel 2', 'room_type' => 'carrel', 'capacity' => 1, 'status' => 'active'],
        ['room_code' => 'CARREL-03', 'room_name' => 'Carrel 3', 'room_type' => 'carrel', 'capacity' => 1, 'status' => 'active'],
        ['room_code' => 'DISC-01', 'room_name' => 'Discussion Room 1', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'active'],
        ['room_code' => 'DISC-02', 'room_name' => 'Discussion Room 2', 'room_type' => 'discussion', 'capacity' => 6, 'status' => 'maintenance'],
        ['room_code' => 'SEMINAR-3', 'room_name' => 'Seminar Room 3', 'room_type' => 'seminar', 'capacity' => 130, 'status' => 'active'],
        ['room_code' => 'LOBBY', 'room_name' => 'Lobby Area', 'room_type' => 'lobby', 'capacity' => 0, 'status' => 'active'],
        ['room_code' => 'STUDY-24H', 'room_name' => '24-Hour Study Room', 'room_type' => 'study_24h', 'capacity' => 0, 'status' => 'active'],
        // Only room of its type is under maintenance, so the whole type should be hidden.
        ['room_code' => 'ISL', 'room_name' => 'Information Searching Laboratory', 'room_type' => 'lab', 'capacity' => 40, 'status' => 'maintenance'],
        // A type the Browse Rooms page doesn't know about.
        ['room_code' => 'STORE-1', 'room_name' => 'Storeroom', 'room_type' => 'storeroom', 'capacity' => 2, 'status' => 'active'],
    ]);
});

function catalogGroup(string $id): ?array
{
    return collect(test()->getJson('/api/rooms')->assertOk()->json())->firstWhere('id', $id);
}

test('the room catalog is public and returns a list of room groups', function () {
    $this->getJson('/api/rooms')->assertOk()->assertJsonIsArray();
});

test('rooms are grouped by type with the group name, total and description', function () {
    $carrel = catalogGroup('carrel');

    expect($carrel['name'])->toBe('Carrel Rooms')
        ->and($carrel['total'])->toBe(3)
        ->and($carrel['description'])->not->toBeEmpty();
});

test('each room type belongs to the category used by the page filters', function () {
    expect(catalogGroup('carrel')['type'])->toBe('Study')
        ->and(catalogGroup('discussion')['type'])->toBe('Discussion')
        ->and(catalogGroup('seminar')['type'])->toBe('Meeting')
        ->and(catalogGroup('lobby')['type'])->toBe('Events');

    // Every category returned must be one of the filter tabs on Browse Rooms.
    $categories = collect($this->getJson('/api/rooms')->json())->pluck('type')->unique();
    expect($categories->diff(['Study', 'Discussion', 'Meeting', 'Events'])->all())->toBe([]);
});

test('capacity is returned, and shown as null for rooms without seats', function () {
    expect(catalogGroup('carrel')['capacity'])->toBe(1)
        ->and(catalogGroup('discussion')['capacity'])->toBe(6)
        ->and(catalogGroup('seminar')['capacity'])->toBe(130)
        ->and(catalogGroup('lobby')['capacity'])->toBeNull();
});

test('only bookable room types are flagged bookable (the "Bookable only" filter)', function () {
    expect(catalogGroup('carrel')['bookable'])->toBeTrue()
        ->and(catalogGroup('discussion')['bookable'])->toBeTrue()
        ->and(catalogGroup('seminar')['bookable'])->toBeTrue()
        ->and(catalogGroup('lobby')['bookable'])->toBeFalse()
        ->and(catalogGroup('study_24h')['bookable'])->toBeFalse();
});

test('rooms under maintenance are not counted in the total', function () {
    // DISC-02 is under maintenance, so only DISC-01 counts.
    expect(catalogGroup('discussion')['total'])->toBe(1);
});

test('a type with only maintenance rooms, or an unknown type, is hidden', function () {
    $ids = collect($this->getJson('/api/rooms')->json())->pluck('id');

    expect($ids->contains('lab'))->toBeFalse()
        ->and($ids->contains('storeroom'))->toBeFalse();
});

test('a single room can be fetched by id', function () {
    $room = Room::where('room_code', 'DISC-01')->first();

    $this->getJson("/api/rooms/{$room->id}")
        ->assertOk()
        ->assertJsonPath('room_code', 'DISC-01')
        ->assertJsonPath('capacity', 6);
});

test('asking for a room that does not exist returns 404', function () {
    $this->getJson('/api/rooms/999999')->assertNotFound();
});