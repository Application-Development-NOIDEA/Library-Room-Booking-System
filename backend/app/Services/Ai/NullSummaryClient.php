<?php

namespace App\Services\Ai;

use RuntimeException;

/** Used when no AI is configured: the summary is written by ReportSummarizer's own rules instead. */
class NullSummaryClient implements SummaryAiClient
{
    public function summarize(string $prompt): string
    {
        throw new RuntimeException('No AI provider is configured.');
    }
}