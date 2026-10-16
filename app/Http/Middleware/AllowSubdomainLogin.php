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

        $user = Auth::user();

        if (! $user) {
            return $next($request);
        }

        $host = $request->getHost();
        // Not config("subdomains.host_role_map.{$host}"): the dots in a hostname
        // would be read as nested keys and the lookup would always come back null.
        $expectedRole = config('subdomains.host_role_map', [])[$host] ?? null;

        // If the host matches a role and the user has it, send them to dashboard.
        // A store manager works in the seller app (see EnsureCorrectSubdomainRole),
        // but has no host of their own in the map.
        if ($expectedRole && ($user->hasRole($expectedRole) || ($expectedRole === 'seller' && $user->hasRole('store_manager')))) {
            return redirect()->to('/dashboard');
        }

        // If we are sharing sessions across subdomains, redirect them to their respective role's dashboard.
        if (!config('subdomains.separated_session_hosts', false)) {
            $primaryRole = $user->roles->pluck('name')->first();
            $targetHost = null;
            foreach (config('subdomains.host_role_map', []) as $mappedHost => $mappedRole) {
                if ($mappedRole === $primaryRole) {
                    $targetHost = $mappedHost;
                    break;
                }
            }

            if ($targetHost && $targetHost !== $host) {
                $protocol = $request->isSecure() ? 'https://' : 'http://';
                $port = $request->getPort();
                $portSuffix = ($port && !in_array($port, [80, 443])) ? ":{$port}" : "";
                return redirect()->to($protocol . $targetHost . $portSuffix . '/dashboard');
            }
        }

        // A signed-in user on a host with no role of its own (the root domain, or
        // a role the map does not know) has no business on a guest page: send them
        // to the home route, which routes them on. Only for page views, so a POST
        // (signing in as someone else) still goes through.
        if (! $expectedRole && $request->isMethodSafe()) {
            return redirect()->to('/');
        }

        // Otherwise allow the login/register forms on this subdomain.
        return $next($request);
    }
}
