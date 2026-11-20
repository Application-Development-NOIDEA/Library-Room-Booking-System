<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/**
 * Change password (frontend: ChangePassword.jsx on My Profile).
 *
 *   PUT /api/auth/password
 *   { current_password, password, password_confirmation }
 *
 * After a change, every other device is signed out; this one stays signed in.
 */
class PasswordController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'regex:/[A-Za-z]/', 'regex:/[0-9]/', 'confirmed'],
        ], [
            'current_password.required' => 'Enter your current password.',
            'password.min' => 'Your new password needs at least 8 characters.',
            'password.regex' => 'Your new password needs at least one letter and one number.',
            'password.confirmed' => 'The new passwords do not match.',
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            return response()->json(['message' => 'Your current password is incorrect.'], 422);
        }

        if (Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Choose a password different from your current one.'], 422);
        }

        $user->password = $data['password']; // hashed by the model cast
        $user->save();

        // Sign out everywhere else, but keep this session.
        $currentId = $user->currentAccessToken()?->id ?? null;
        $user->tokens()->when($currentId, fn ($query) => $query->whereKeyNot($currentId))->delete();

        return response()->json(['message' => 'Password changed. Other devices have been signed out.']);
    }
}