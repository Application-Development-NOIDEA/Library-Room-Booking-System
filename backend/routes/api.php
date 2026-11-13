<?php

// Add these lines to your existing routes/api.php

use App\Http\Controllers\StudentDashboardController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/student/dashboard', [StudentDashboardController::class, 'index']);
});