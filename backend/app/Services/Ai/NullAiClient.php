<?php

namespace App\Services\Ai;

use App\Models\IssueReport;
use RuntimeException;

/** Used when no AI provider is configured: every report falls back to staff review. */
class NullAiClient implements AiClient
{
    public function analyze(IssueReport $report): string
    {
        throw new RuntimeException('No AI provider is configured.');
    }
}