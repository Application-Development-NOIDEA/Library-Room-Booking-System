<?php

namespace App\Providers;

use App\Services\Ai\AiClient;
use App\Services\Ai\NullAiClient;
use Illuminate\Support\ServiceProvider;
use App\Services\Ai\GeminiClient;

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
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
