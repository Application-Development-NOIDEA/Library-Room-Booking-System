<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Asks Google Gemini for a period summary. Uses the same GEMINI_API_KEY / GEMINI_MODEL as GeminiClient. */
class GeminiSummaryClient implements SummaryAiClient
{
    public function summarize(string $prompt): string
    {
        $key = config('services.gemini.key');
        if (! $key) {
            throw new RuntimeException('GEMINI_API_KEY is not set.');
        }

        $model = config('services.gemini.model');

        $response = Http::withHeaders(['x-goog-api-key' => $key])
            ->timeout(30)
            ->post("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent", [
                'contents' => [['parts' => [['text' => $prompt]]]],
                'generationConfig' => [
                    'temperature' => 0.2,
                    'responseMimeType' => 'application/json',
                ],
            ])
            ->throw();

        $text = $response->json('candidates.0.content.parts.0.text');
        if (! is_string($text) || trim($text) === '') {
            throw new RuntimeException('Gemini returned no text.');
        }

        return $text;
    }
}