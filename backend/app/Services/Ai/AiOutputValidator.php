<?php

namespace App\Services\Ai;

use App\Models\IssueReport;
use App\Models\IssueReportAnalysis;

/** Decides whether an AI answer can be trusted enough to even look at its confidence. */
class AiOutputValidator
{
    public const SUMMARY_MIN = 5;
    public const SUMMARY_MAX = 300;

    /** @return array{ok: bool, data: ?array, error: ?string} */
    public function validate(string $raw): array
    {
        $text = trim($raw);

        // Models often wrap JSON in ```json fences.
        if (preg_match('/^```(?:json)?\s*(.*?)\s*```$/si', $text, $match)) {
            $text = trim($match[1]);
        }

        $data = json_decode($text, true);

        if (! is_array($data) || $data === [] || array_is_list($data)) {
            return $this->fail('The answer is not a JSON object.');
        }

        $category = $data['category'] ?? null;
        if (! is_string($category) || ! in_array($category, IssueReport::CATEGORIES, true)) {
            return $this->fail('Unknown or missing category.');
        }

        $severity = is_string($data['severity'] ?? null) ? strtolower(trim($data['severity'])) : null;
        if (! in_array($severity, IssueReportAnalysis::SEVERITIES, true)) {
            return $this->fail('Unknown or missing severity.');
        }

        $summary = is_string($data['summary'] ?? null) ? trim($data['summary']) : '';
        $length = mb_strlen($summary);
        if ($length < self::SUMMARY_MIN || $length > self::SUMMARY_MAX) {
            return $this->fail('Summary is missing or the wrong length.');
        }

        $confidence = $data['confidence'] ?? null;
        if ((! is_int($confidence) && ! is_float($confidence)) || $confidence < 0 || $confidence > 1) {
            return $this->fail('Confidence must be a number from 0 to 1.');
        }

        return [
            'ok' => true,
            'data' => [
                'category' => $category,
                'severity' => $severity,
                'summary' => $summary,
                'confidence' => (float) $confidence,
            ],
            'error' => null,
        ];
    }

    private function fail(string $error): array
    {
        return ['ok' => false, 'data' => null, 'error' => $error];
    }
}