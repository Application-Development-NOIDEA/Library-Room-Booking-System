<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * My Profile (frontend: Profile.jsx).
 *
 *   PUT /api/profile   { name, student_id, programme, year_of_study, campus }
 *
 * Reading the profile needs no extra endpoint: /api/auth/login and
 * /api/auth/me already return these fields (User::toProfileArray).
 */
class ProfileController extends Controller
{
    /** UTM matric number, e.g. A22EC0123 (same check as Profile.jsx). */
    private const MATRIC_PATTERN = '/^[A-Z]\d{2}[A-Z]{2}\d{4}$/';

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->merge([
            'student_id' => strtoupper(trim((string) $request->input('student_id'))) ?: null,
            'name' => preg_replace('/\s+/', ' ', trim((string) $request->input('name'))),
        ]);

        $data = $request->validate([
            'name' => ['required', 'string', 'min:3', 'max:150'],
            'student_id' => [
                'nullable', 'string', 'regex:'.self::MATRIC_PATTERN,
                Rule::unique('users', 'student_id')->ignore($user->id),
            ],
            'programme' => ['required', 'string', 'min:3', 'max:150'],
            'year_of_study' => ['required', 'integer', 'between:1,5'],
            'campus' => ['required', Rule::in(User::CAMPUSES)],
        ], [
            'name.min' => 'Enter your full name.',
            'student_id.regex' => 'Use the format on your matric card, e.g. A22EC0123.',
            'student_id.unique' => 'That matric number is already used by another account.',
            'programme.min' => 'Enter your programme.',
            'year_of_study.between' => 'Choose your year of study.',
            'campus.in' => 'Choose your campus.',
        ]);

        // Your matric number is your identity: once it is set, only staff can change it.
        if ($user->student_id && $data['student_id'] !== $user->student_id) {
            return response()->json([
                'message' => 'Your matric number can only be changed by library staff.',
            ], 422);
        }

        $user->fill([
            'name' => $data['name'],
            'student_id' => $data['student_id'],
            'programme' => trim($data['programme']),
            'year_of_study' => (int) $data['year_of_study'],
            'campus' => $data['campus'],
        ])->save();

        return response()->json(['user' => $user->fresh()->toProfileArray()]);
    }
}