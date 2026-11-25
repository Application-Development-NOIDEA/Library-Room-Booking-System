<?php

namespace App\Services\Ai;

/** Sends a prompt to the AI and returns its raw text. Throws if the AI can't be reached. */
interface SummaryAiClient
{
    public function summarize(string $prompt): string;
}