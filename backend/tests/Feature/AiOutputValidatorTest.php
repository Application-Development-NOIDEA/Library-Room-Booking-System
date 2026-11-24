<?php

use App\Services\Ai\AiOutputValidator;

function aiJson(array $override = []): string
{
    return json_encode(array_merge([
        'category' => 'lighting',
        'severity' => 'medium',
        'summary' => 'Ceiling light flickers near the whiteboard.',
        'confidence' => 0.9,
    ], $override));
}

test('a good answer is accepted and tidied up', function () {
    $result = (new AiOutputValidator())->validate(aiJson(['severity' => ' High ']));

    expect($result['ok'])->toBeTrue();
    expect($result['data'])->toBe([
        'category' => 'lighting',
        'severity' => 'high',
        'summary' => 'Ceiling light flickers near the whiteboard.',
        'confidence' => 0.9,
    ]);
});

test('an answer wrapped in code fences is accepted', function () {
    $result = (new AiOutputValidator())->validate("```json\n".aiJson()."\n```");

    expect($result['ok'])->toBeTrue();
    expect($result['data']['category'])->toBe('lighting');
});

dataset('bad ai outputs', [
    'plain text' => ['The light is probably broken.'],
    'a list, not an object' => ['["lighting","high"]'],
    'empty object' => ['{}'],
    'unknown category' => [aiJson(['category' => 'aliens'])],
    'unknown severity' => [aiJson(['severity' => 'critical'])],
    'summary too short' => [aiJson(['summary' => 'ok'])],
    'summary too long' => [aiJson(['summary' => str_repeat('a', 301)])],
    'confidence above 1' => [aiJson(['confidence' => 1.5])],
    'confidence below 0' => [aiJson(['confidence' => -0.1])],
    'confidence as text' => [aiJson(['confidence' => 'high'])],
    'confidence missing' => ['{"category":"lighting","severity":"low","summary":"Ceiling light flickers."}'],
]);

test('a bad answer is rejected', function (string $raw) {
    $result = (new AiOutputValidator())->validate($raw);

    expect($result['ok'])->toBeFalse();
    expect($result['data'])->toBeNull();
    expect($result['error'])->toBeString();
})->with('bad ai outputs');