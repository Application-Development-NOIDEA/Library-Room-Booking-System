<?php

namespace App\Providers;

use App\Services\Ai\AiClient;
use App\Services\Ai\NullAiClient;
use Illuminate\Support\ServiceProvider;
use App\Services\Ai\GeminiClient;
use App\Services\Ai\GeminiSummaryClient;
use App\Services\Ai\NullSummaryClient;
use App\Services\Ai\SummaryAiClient;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
        public function register(): void
    {
        $this->app->bind(AiClient::class, function () {
            return match (config('services.ai.driver')) {
                'gemini' => new GeminiClient(),
                default => new NullAiClient(),
            };
        });
        $this->app->bind(SummaryAiClient::class, function () {
            return match (config('services.ai.driver')) {
                'gemini' => new GeminiSummaryClient(),
                default => new NullSummaryClient(),
            };
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
