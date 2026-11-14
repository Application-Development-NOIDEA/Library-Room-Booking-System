<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\RoomController;
use App\Http\Controllers\StudentDashboardController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\WaitingListController;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:10,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

Route::get('/rooms', [RoomController::class, 'index']);
Route::get('/rooms/{room}', [RoomController::class, 'show']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/student/dashboard', [StudentDashboardController::class, 'index']);
});

// Booking (students must be signed in)
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/rooms/{type}/availability', [BookingController::class, 'availability'])
        ->where('type', '[a-z_0-9]+');

    Route::middleware('role:student')->group(function () {
        Route::get('/bookings/mine', [BookingController::class, 'mine']);
        Route::post('/bookings', [BookingController::class, 'store'])->middleware('throttle:20,1');
        Route::post('/bookings/{booking}/cancel', [BookingController::class, 'cancel']);
        
        // Waiting list
        Route::get('/waiting-list/mine', [WaitingListController::class, 'mine']);
        Route::post('/waiting-list', [WaitingListController::class, 'store'])->middleware('throttle:20,1');
        Route::post('/waiting-list/{waitingList}/accept', [WaitingListController::class, 'accept']);
        Route::post('/waiting-list/{waitingList}/leave', [WaitingListController::class, 'leave']);
    });
});
