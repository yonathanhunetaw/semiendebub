<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsureCorrectSubdomainRole
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next, $subdomainRole)
    {
        $user = Auth::user();

        // 1. If not logged in, just let them pass (to login page or public routes)
        if (!$user) {
            return $next($request);
        }

        // --- LOGGING (For your Dev visibility) ---
        \Log::info('Subdomain Middleware Check', [
            'user_id' => $user->id,
            'roles' => $user->roles->pluck('name')->toArray(),
            'host' => $request->getHost(),
            'required' => $subdomainRole,
            'separated_session_hosts' => $this->separatedSessionHosts(),
        ]);

        // 2. THE ADMIN BYPASS
        // If the user is an admin, they are allowed on ANY subdomain.
        if ($user->hasRole('admin')) {
            return $next($request);
        }

        // 3. THE DIRECT ROLE MATCH
        // If the user has the specific role for this subdomain, let them in.
        if ($user->hasRole($subdomainRole)) {
            return $next($request);
        }

        // 4. THE DEV MODE BYPASS
        // If you are in local dev and have SESSION_DOMAIN=null, STOP the redirects.
        // This allows you to stay logged into different accounts in different tabs.
        if ($this->separatedSessionHosts()) {
            abort(403, "Dev Mode: User #{$user->id} lacks '{$subdomainRole}' role. Redirect disabled to allow multi-account testing.");
        }

        // 5. PRODUCTION REDIRECT LOGIC
        // If we reach this point, the user is in the wrong place.
        // We find their "home" and send them there.
        $primaryRole = $user->roles->pluck('name')->first();
        $targetHost = $this->hostForRole($primaryRole);

        if ($targetHost) {
            $protocol = $request->isSecure() ? 'https://' : 'http://';
            $port = $request->getPort();
            $portSuffix = ($port && !in_array($port, [80, 443])) ? ":{$port}" : "";

            $url = $protocol . $targetHost . $portSuffix . '/dashboard';

            // Prevent infinite redirect loops
            if ($request->fullUrl() !== $url) {
                \Log::warning('Middleware: Redirecting user to their primary home', ['target' => $url]);
                return redirect()->to($url);
            }
        }

        // Final fallback if no roles found
        abort(403, 'Unauthorized subdomain access.');
    }
    private function homeUrl(Request $request): string
    {
        return $request->getSchemeAndHttpHost() . '/';
    }

    private function separatedSessionHosts(): bool
    {
        return (bool) config('subdomains.separated_session_hosts', false);
    }

    private function hostForRole(?string $role): ?string
    {
        if (! $role) {
            return null;
        }

        foreach (config('subdomains.host_role_map', []) as $host => $mappedRole) {
            if ($mappedRole === $role) {
                return $host;
            }
        }

        return null;
    }
}
