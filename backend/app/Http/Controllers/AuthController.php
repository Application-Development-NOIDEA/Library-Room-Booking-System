<?php

namespace App\Http\Controllers;

use App\Mail\ResetPasswordMail;
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
    /** How long a reset link works. */
    public const RESET_MINUTES = 60;

    private function userPayload(User $user): array
    {
        return $user->toProfileArray();
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

    /**
     * POST /api/auth/forgot-password  { email }
     * Emails a reset link. Needs real MAIL_ settings in .env (MAIL_MAILER=log only writes to the log).
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(
            ['email' => ['required', 'email']],
            ['email.email' => 'Enter a valid email address.']
        );
        $email = strtolower(trim($data['email']));

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

            try {
                Mail::to($email)->send(new ResetPasswordMail($user->name, $link, self::RESET_MINUTES));
            } catch (\Throwable $e) {
                report($e); // details go to storage/logs/laravel.log

                return response()->json([
                    'message' => "We couldn't send the email right now. Please try again in a few minutes.",
                ], 503);
            }
        }

        // Same answer whether or not the account exists (prevents email probing).
        return response()->json(['message' => 'If that email is registered, a reset link has been sent.']);
    }

    /**
     * POST /api/auth/reset-password  { token, password }
     * Works once, within RESET_MINUTES. Signs the user out everywhere.
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'regex:/[A-Za-z]/', 'regex:/[0-9]/'],
        ], [
            'password.min' => 'Your new password needs at least 8 characters.',
            'password.regex' => 'Your new password needs at least one letter and one number.',
        ]);

        $invalid = response()->json(
            ['message' => 'This reset link is invalid or has expired. Please request a new one.'],
            400
        );

        $row = DB::table('password_reset_tokens')
            ->where('token', hash('sha256', $data['token']))
            ->first();

        if (! $row || Carbon::parse($row->created_at)->addMinutes(self::RESET_MINUTES)->isPast()) {
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

        return response()->json(['message' => 'Your password has been reset. Sign in with your new password.']);
    }
}