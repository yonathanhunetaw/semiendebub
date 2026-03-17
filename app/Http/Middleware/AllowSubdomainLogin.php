<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class AllowSubdomainLogin
{
    /**
     * Allow login on a subdomain even if the user is authenticated with a different role.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next)
    {
        // AllowSubdomainLogin: This is your "Gatekeeper." It checks if the user has
        // a session for this specific island. If they don't, it shows the login form.
        // If they do (and they have the right role), it sends them to the dashboard.

        $baseDomain = config('app.system_domain', 'duka.local');

        $user = Auth::user();

        if (! $user) {
            return $next($request);
        }

        $hostToRole = [
            "admin.{$baseDomain}" => 'admin',
            "delivery.{$baseDomain}" => 'delivery',
            "seller.{$baseDomain}" => 'seller',
            "stock.{$baseDomain}" => 'stock_keeper',
            "finance.{$baseDomain}" => 'finance',
            "marketing.{$baseDomain}" => 'marketing',
            "procurement.{$baseDomain}" => 'procurement',
            'shared.{$baseDomain}' => 'shared',
            'vendor.{$baseDomain}' => 'vendor',
            'guest.{$baseDomain}' => 'guest',
            'dev.{$baseDomain}' => 'dev',
        ];

        $host = $request->getHost();
        $expectedRole = $hostToRole[$host] ?? null;

        // If the host matches a role and the user has it, send them to dashboard.
        if ($expectedRole && $user->hasRole($expectedRole)) {
            return redirect()->to('/dashboard');
        }

        // Otherwise allow the login/register forms on this subdomain.
        return $next($request);
    }
}
