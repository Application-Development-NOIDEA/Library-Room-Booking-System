<?php

namespace App\Services\Ai;

use App\Models\IssueReport;

interface AiClient
{
    /**
     * Return the AI's raw text answer for this report (see AiPrompt::forReport).
     * Throw any exception if the AI cannot be reached: the report then goes to staff review.
     */
    public function analyze(IssueReport $report): string;
}