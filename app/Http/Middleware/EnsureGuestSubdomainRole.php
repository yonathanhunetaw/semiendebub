<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureGuestSubdomainRole
{
    /**
     * Redirect guest pages on role subdomains to the correct login/dashboard.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next)
    {
        $baseDomain = config('app.system_domain', 'duka.local');

        $hostToRole = [
            "admin.{$baseDomain}" => 'admin',
            "delivery.{$baseDomain}" => 'delivery',
            "seller.{$baseDomain}" => 'seller',
            "stock.{$baseDomain}" => 'stock_keeper',
            "finance.{$baseDomain}" => 'finance',
            "marketing.{$baseDomain}" => 'marketing',
            "procurement.{$baseDomain}" => 'procurement',
            "shared.{$baseDomain}" => 'shared',
            "vendor.{$baseDomain}" => 'vendor',
            "guest.{$baseDomain}" => 'guest',
            "dev.{$baseDomain}" => 'dev',
        ];

        $host = $request->getHost();

        if (! isset($hostToRole[$host])) {
            return $next($request);
        }

        $expectedRole = $hostToRole[$host];
        $user = $request->user();

        if (! $user || ! $user->hasRole($expectedRole)) {
            return redirect()->to($request->getSchemeAndHttpHost().'/');
        }

        return redirect()->to('/dashboard');
    }
}
