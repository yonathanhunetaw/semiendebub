<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnsureGuestSubdomainRole
{
    /**
     * Redirect guest pages on role subdomains to the correct login/dashboard.
     *
     * @param  Closure(Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next)
    {
        $hostToRole = [
            'admin.duka.local' => 'admin',
            'delivery.duka.local' => 'delivery',
            'seller.duka.local' => 'seller',
            'stock.duka.local' => 'stock_keeper',
            'finance.duka.local' => 'finance',
            'marketing.duka.local' => 'marketing',
            'procurement.duka.local' => 'procurement',
            'shared.duka.local' => 'shared',
            'vendor.duka.local' => 'vendor',
            'guest.duka.local' => 'guest',
            'dev.duka.local' => 'dev',
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
