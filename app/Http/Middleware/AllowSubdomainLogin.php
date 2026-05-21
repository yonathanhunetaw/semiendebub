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
        $expectedRole = config("subdomains.host_role_map.{$host}");

        // If the host matches a role and the user has it, send them to dashboard.
        if ($expectedRole && $user->hasRole($expectedRole)) {
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

        // Otherwise allow the login/register forms on this subdomain.
        return $next($request);
    }
}
