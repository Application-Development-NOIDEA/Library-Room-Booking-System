<?php

namespace App\Http\Controllers;

use App\Services\Ai\CategorySuggester;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Report an Issue: AI category suggestion while the student types.
 *
 *   POST /api/reports/suggest   { description }  ->  { suggestion: {category, severity, confidence, source} | null }
 *
 * Nothing is saved. The student still chooses the category themselves.
 */
class ReportSuggestionController extends Controller
{
    public function __invoke(Request $request, CategorySuggester $suggester): JsonResponse
    {
        $data = $request->validate([
            'description' => ['required', 'string', 'min:10', 'max:500'],
        ], [
            'description.min' => 'Describe the problem in at least 10 characters.',
        ]);

        return response()->json(['suggestion' => $suggester->suggest(trim($data['description']))]);
    }
}