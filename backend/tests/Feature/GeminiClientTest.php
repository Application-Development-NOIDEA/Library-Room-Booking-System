<?php

use App\Models\IssueReport;
use App\Services\Ai\GeminiClient;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'test-model']);
});

function geminiReport(): IssueReport
{
    return new IssueReport(['issue_category' => 'lighting', 'description' => 'The light flickers.']);
}

test('the Gemini client sends the report and returns the answer text', function () {
    Http::fake([
        'generativelanguage.googleapis.com/*' => Http::response([
            'candidates' => [['content' => ['parts' => [['text' => '{"category":"lighting"}']]]]],
        ]),
    ]);

    expect((new GeminiClient())->analyze(geminiReport()))->toBe('{"category":"lighting"}');

    Http::assertSent(fn ($request) => $request->hasHeader('x-goog-api-key', 'test-key')
        && str_contains($request->url(), 'test-model')
        && str_contains($request['contents'][0]['parts'][0]['text'], 'The light flickers.'));
});

test('the Gemini client throws when Google returns an error', function () {
    Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['error' => 'quota'], 429)]);

    expect(fn () => (new GeminiClient())->analyze(geminiReport()))->toThrow(Exception::class);
});

test('the Gemini client throws when there is no key or no text', function () {
    config(['services.gemini.key' => null]);
    expect(fn () => (new GeminiClient())->analyze(geminiReport()))->toThrow(RuntimeException::class);

    config(['services.gemini.key' => 'test-key']);
    Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => []])]);
    expect(fn () => (new GeminiClient())->analyze(geminiReport()))->toThrow(RuntimeException::class);
});