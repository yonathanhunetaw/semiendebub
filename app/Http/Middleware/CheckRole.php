<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

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

        $roleToRoute = [
            'admin' => 'admin.dashboard',
            'delivery' => 'delivery.dashboard',
            'dev' => 'dev.dashboard',
            'finance' => 'finance.dashboard',
            'guest' => 'home',
            'marketing' => 'marketing.dashboard',
            'procurement' => 'procurement.dashboard',
            'seller' => 'seller.dashboard',
            'shared' => 'shared.dashboard',
            'stock_keeper' => 'stock_keeper.dashboard',
            'vendor' => 'vendor.dashboard',
            'user' => 'user.home',
        ];

        $userRole = $user->roles->pluck('name')->first();

        if ($userRole && isset($roleToRoute[$userRole]) && Route::has($roleToRoute[$userRole])) {
            return redirect()->route($roleToRoute[$userRole]);
        }

        return redirect()->to($request->getSchemeAndHttpHost().'/login');
    }
}
