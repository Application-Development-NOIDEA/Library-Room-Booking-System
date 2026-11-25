<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\BookingExtensionController;
use App\Http\Controllers\BookingQrController;
use App\Http\Controllers\IssueReportController;
use App\Http\Controllers\PasswordController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\RoomController;
use App\Http\Controllers\StaffBookingController;
use App\Http\Controllers\StudentDashboardController;
use App\Http\Controllers\WaitingListController;
use App\Http\Controllers\StaffIssueReviewController;
use App\Http\Controllers\StaffReportSummaryController;
use App\Http\Controllers\StaffDeskController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

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
        Route::put('/password', [PasswordController::class, 'update'])->middleware('throttle:6,1');
    });
});

Route::get('/rooms', [RoomController::class, 'index']);
Route::get('/rooms/{room}', [RoomController::class, 'show']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/student/dashboard', [StudentDashboardController::class, 'index']);
    Route::get('/rooms/{type}/availability', [BookingController::class, 'availability'])
        ->where('type', '[a-z_0-9]+');

    // Students only
    Route::middleware('role:student')->group(function () {
        // Bookings
        Route::get('/bookings/mine', [BookingController::class, 'mine']);
        Route::post('/bookings', [BookingController::class, 'store'])->middleware('throttle:20,1');
        Route::post('/bookings/{booking}/cancel', [BookingController::class, 'cancel']);
        Route::post('/bookings/{booking}/extend', [BookingExtensionController::class, 'store'])->middleware('throttle:10,1');

        // Generate a secure booking QR token
        Route::post('/bookings/{booking}/qr', [BookingQrController::class, 'issue'])->middleware('throttle:10,1');

        // Waiting list
        Route::get('/waiting-list/mine', [WaitingListController::class, 'mine']);
        Route::post('/waiting-list', [WaitingListController::class, 'store'])->middleware('throttle:20,1');
        Route::post('/waiting-list/{waitingList}/accept', [WaitingListController::class, 'accept']);
        Route::post('/waiting-list/{waitingList}/leave', [WaitingListController::class, 'leave']);

        // Report an Issue
        Route::get('/reports/bookings', [IssueReportController::class, 'bookings']);
        Route::get('/reports/mine', [IssueReportController::class, 'mine']);
        Route::post('/reports', [IssueReportController::class, 'store'])->middleware('throttle:10,1');

        // My Profile
        Route::put('/profile', [ProfileController::class, 'update']);
    });
});

// Staff (library staff only)
Route::middleware(['auth:sanctum', 'role:staff'])->prefix('staff')->group(function () {
    Route::get('/bookings', [StaffBookingController::class, 'index']);

    // Front desk
    Route::get('/dashboard', [StaffDeskController::class, 'dashboard']);
    Route::post('/bookings/lookup', [StaffDeskController::class, 'lookup'])->middleware('throttle:60,1');
    Route::post('/bookings/{booking}/check-in', [StaffDeskController::class, 'checkIn'])->whereNumber('booking');
    Route::post('/bookings/{booking}/check-out', [StaffDeskController::class, 'checkOut'])->whereNumber('booking');
    Route::post('/bookings/{booking}/no-show', [StaffDeskController::class, 'noShow'])->whereNumber('booking');
    Route::post('/walk-ins', [StaffDeskController::class, 'walkIn'])->middleware('throttle:30,1');

    // Rooms, waiting list, extensions, issue reports
    Route::patch('/rooms/{room}/status', [StaffDeskController::class, 'setRoomStatus'])->whereNumber('room');
    Route::post('/waitlist/process', [StaffDeskController::class, 'processWaitlist']);
    Route::patch('/extensions/{extension}/decision', [StaffDeskController::class, 'decideExtension'])->whereNumber('extension');
    Route::patch('/reports/{report}/status', [StaffDeskController::class, 'setReportStatus'])->whereNumber('report');

   
// AI review queue
    Route::get('/issue-reports/review', [StaffIssueReviewController::class, 'index']);
    Route::post('/issue-reports/{report}/review', [StaffIssueReviewController::class, 'review'])->whereNumber('report');

    // AI Report Analyzer (period summaries)
    Route::get('/report-summaries', [StaffReportSummaryController::class, 'index']);
    Route::post('/report-summaries', [StaffReportSummaryController::class, 'store'])->middleware('throttle:5,1');
});