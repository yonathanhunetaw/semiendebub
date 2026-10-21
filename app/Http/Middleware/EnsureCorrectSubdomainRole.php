<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * The gate in front of every role subdomain's authenticated routes.
 *
 * A global admin may enter any subdomain and a store admin only the
 * store-scoped ones (`subdomains.store_admin_roles`); anyone else needs one of the roles the
 * route group names (`role.subdomain:seller,store_manager`). What happens to a
 * user in the wrong place depends on how sessions are shared: with one session
 * per host (local multi-account testing) they get a 403, so the tab is not
 * yanked to another account's app; with a shared session they are sent to
 * their own app's dashboard.
 *
 * This used to open with `return $next($request);`, which made every check
 * below dead code: any verified user could reach any subdomain's routes.
 */
class EnsureCorrectSubdomainRole
{
    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next, string ...$subdomainRoles)
    {
        $user = Auth::user();

        // Not signed in: `auth` (which runs first) owns that case.
        if (! $user) {
            return $next($request);
        }

        // A global admin may enter any subdomain; a store admin only the apps
        // that scope to their store (`subdomains.store_admin_roles`).
        if ($user->hasRole('admin') && $this->adminMayEnter($user, $subdomainRoles)) {
            return $next($request);
        }

        if ($user->hasAnyRole($subdomainRoles)) {
            return $next($request);
        }

        // One session per host: refuse rather than redirect, so another tab's
        // account is never bounced around.
        if ($this->separatedSessionHosts()) {
            abort(403, "User #{$user->id} lacks the '".implode("' or '", $subdomainRoles)."' role for this app.");
        }

        // Shared session: send the user to their own app's dashboard.
        $targetHost = $this->hostForRole($user->roles->pluck('name')->first());

        if ($targetHost) {
            $port = $request->getPort();
            $portSuffix = ($port && ! in_array($port, [80, 443])) ? ":{$port}" : '';
            $url = ($request->isSecure() ? 'https://' : 'http://').$targetHost.$portSuffix.'/dashboard';

            // Never redirect onto the very page being refused.
            if ($request->fullUrl() !== $url) {
                return redirect()->to($url);
            }
        }

        abort(403, 'Unauthorized subdomain access.');
    }

    /**
     * @param  array<int, string>  $subdomainRoles
     */
    private function adminMayEnter($user, array $subdomainRoles): bool
    {
        if ($user->store_id === null) {
            return true;
        }

        return array_intersect($subdomainRoles, config('subdomains.store_admin_roles', [])) !== [];
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
