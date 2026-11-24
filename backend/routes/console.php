<?php

use App\Services\WaitingListService;
use App\Models\IssueReport;
use App\Services\Ai\IssueReportAnalyzer;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use App\Services\BookingReminderService;

/*
 | Safety net for the AI step: analyse reports that have no result yet
 | (the AI step crashed, or reports from before this feature existed).
 |
 | Run once: php artisan issue-reports:analyze-pending
 */
Artisan::command('issue-reports:analyze-pending', function (IssueReportAnalyzer $analyzer) {
    $reports = IssueReport::whereDoesntHave('analysis')
        ->where('created_at', '<=', now()->subMinutes(2)) // leave brand-new ones to the normal flow
        ->orderBy('id')
        ->limit(50)
        ->get();

    foreach ($reports as $report) {
        try {
            $analyzer->analyze($report);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    $this->info("Analysed {$reports->count()} report(s).");
})->purpose('Analyse issue reports that have no AI result yet');

Schedule::command('issue-reports:analyze-pending')->everyFiveMinutes()->withoutOverlapping();

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

Schedule::command('waiting-list:process')->everyMinute()->withoutOverlapping();

/*
 | Sprint 3: Booking reminders
 | T16: 30 minutes before booking starts
 | T17: 15 minutes before checkout
 */
Artisan::command(
    'booking-reminders:send {--dry-run}',
    function (BookingReminderService $service) {
        $dryRun = (bool) $this->option('dry-run');

        $result = $service->send($dryRun);

        $label = $dryRun ? 'Eligible' : 'Created';

        $this->info(
            "{$label} start reminders: {$result['start']}"
        );

        $this->info(
            "{$label} checkout reminders: {$result['checkout']}"
        );
    }
)->purpose('Send student booking and checkout reminders');

Schedule::command('booking-reminders:send')
    ->everyMinute()
    ->withoutOverlapping();
