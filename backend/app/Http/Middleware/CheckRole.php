<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckRole
{
    public function handle(
        Request $request,
        Closure $next,
        string ...$roles
    ): Response {

        // Check whether user is logged in
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated. Please login first.',
            ], 401);
        }

        // Check user's role
        if (!in_array($user->role, $roles, true)) {
            return response()->json([
                'success' => false,
                'message' => 'You are not authorized to access this page.',
            ], 403);
        }

        return $next($request);
    }
}

