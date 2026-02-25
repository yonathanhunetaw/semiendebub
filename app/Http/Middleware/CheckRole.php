<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CheckRole
{
    public function handle(Request $request, Closure $next, string $role)
    {
        $user = Auth::user();

        if (! $user) {
            return redirect()->route('login')->with('error', 'You need to be logged in!');
        }

        // Normalize role to lowercase
        $role = strtolower($role);

        // User has the correct role
        if ($user->hasRole($role)) {
            return $next($request);
        }

        // Redirect based on actual user role
        if ($user->hasRole('admin')) {
            return $request->path() !== 'admin/dashboard'
                ? redirect()->route('admin.dashboard')
                : abort(403);
        }
        if ($user->hasRole('seller')) {
            return redirect()->route('seller.dashboard');
        }
        if ($user->hasRole('stock_keeper')) {
            return redirect()->route('stock_keeper.dashboard');
        }
        if ($user->hasRole('user')) {
            return redirect()->route('user.home');
        }

        return redirect()->route('welcome'); // fallback
    }
}
