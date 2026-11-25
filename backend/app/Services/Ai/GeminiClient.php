<?php

namespace App\Services\Ai;

use App\Models\IssueReport;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Asks Google Gemini to classify a report. Any failure throws, and the report goes to staff review. */
class GeminiClient implements AiClient
{
    public function analyze(IssueReport $report): string
    {
        $key = config('services.gemini.key');
        if (! $key) {
            throw new RuntimeException('GEMINI_API_KEY is not set.');
        }

        $model = config('services.gemini.model');

        $response = Http::withHeaders(['x-goog-api-key' => $key])
            ->timeout(20)
            ->post("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent", [
                'contents' => [['parts' => [['text' => AiPrompt::forReport($report)]]]],
                'generationConfig' => [
                    'temperature' => 0,
                    'responseMimeType' => 'application/json',
                ],
            ])
            ->throw();

        $text = $response->json('candidates.0.content.parts.0.text');
        if (! is_string($text) || trim($text) === '') {
            throw new RuntimeException('Gemini returned no text (the answer may have been blocked).');
        }

        return $text;
    }
}