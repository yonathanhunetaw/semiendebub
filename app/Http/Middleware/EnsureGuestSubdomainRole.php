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
        $host = $request->getHost();
        $hostToRole = config('subdomains.host_role_map', []);

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
