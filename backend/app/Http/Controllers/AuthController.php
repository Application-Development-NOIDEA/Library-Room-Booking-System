<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'student_id' => $user->student_id,
            'role' => $user->role,
        ];
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', strtolower($data['email']))->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Incorrect email or password.'], 401);
        }

        $token = $user->createToken('web')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->userPayload($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);
        $email = strtolower($data['email']);

        $user = User::where('email', $email)->first();

        if ($user) {
            $plain = Str::random(64);

            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $email],
                ['token' => hash('sha256', $plain), 'created_at' => now()]
            );

            // Link always points at our own frontend, never at a client-supplied URL.
            $frontend = rtrim(env('FRONTEND_URL', 'http://localhost:5173'), '/');
            $link = "{$frontend}/reset-password?token={$plain}";

            // MAIL_MAILER=log writes this to storage/logs/laravel.log during development.
            Mail::raw(
                "Reset your library booking password (valid for 60 minutes):\n{$link}",
                fn ($m) => $m->to($email)->subject('Reset your password')
            );
        }

        // Same answer whether or not the account exists (prevents email probing).
        return response()->json(['message' => 'If that email is registered, a reset link has been sent.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $invalid = response()->json(
            ['message' => 'This reset link is invalid or has expired. Please request a new one.'],
            400
        );

        $row = DB::table('password_reset_tokens')
            ->where('token', hash('sha256', $data['token']))
            ->first();

        if (! $row || Carbon::parse($row->created_at)->addMinutes(60)->isPast()) {
            return $invalid;
        }

        $user = User::where('email', $row->email)->first();
        if (! $user) {
            return $invalid;
        }

        $user->password = $data['password']; // hashed by the model cast
        $user->save();

        DB::table('password_reset_tokens')->where('email', $row->email)->delete();
        $user->tokens()->delete(); // sign out all existing sessions

        return response()->json(['message' => 'Password updated']);
    }
}