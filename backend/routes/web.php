<?php

use Illuminate\Support\Facades\Route;

// This backend is only an API. The website itself is the React frontend.
Route::get('/', function () {
    return response()->json([
        'app' => 'PSZ Room Booking API',
        'status' => 'ok',
    ]);
});