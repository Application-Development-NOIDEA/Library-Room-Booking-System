<?php

namespace App\Providers;

use App\Services\Ai\AiClient;
use App\Services\Ai\NullAiClient;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
        public function register(): void
    {
        $this->app->bind(AiClient::class, function () {
            return match (config('services.ai.driver')) {
                // 'gemini' => new GeminiClient(...),   <- add the real provider here later
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
