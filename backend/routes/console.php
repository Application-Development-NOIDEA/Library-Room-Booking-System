<?php

use App\Services\WaitingListService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 | Waiting list rules: no-shows after 15 minutes, offers that expire after
 | 10 minutes, and handing free rooms to the next student in the queue.
 |
 | Run once:          php artisan waiting-list:process
 | Run every minute:  php artisan schedule:work   (keep it open while testing)
 */
Artisan::command('waiting-list:process', function (WaitingListService $service) {
    $result = $service->process();

    $this->info(sprintf(
        'No-shows: %d · Expired offers: %d · Expired requests: %d · New offers: %d',
        $result['no_shows'],
        $result['expired_offers'],
        $result['expired_requests'],
        $result['offers'],
    ));
})->purpose('Apply the waiting list rules (no-shows, offer expiry, offering free rooms)');

Schedule::command('waiting-list:process')->everyMinute();