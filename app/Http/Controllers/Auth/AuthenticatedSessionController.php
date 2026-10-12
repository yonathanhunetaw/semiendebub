<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Inertia\Response;

class AuthenticatedSessionController extends Controller
{
    /**
     * Display the login view.
     */
    public function create(): Response
    {
        return Inertia::render($this->loginComponentForHost(request()->getHost()), [
            'canResetPassword' => Route::has('password.request'),
            'status' => session('status'),
        ]);
    }

    /**
     * Handle an incoming authentication request.
     */
    /**
     * Handle an incoming authentication request.
     */
    public function store(LoginRequest $request)
    {
        // 1. CAPTURE THE GUEST SESSION ID BEFORE IT CHANGES
        $guestSessionId = $request->session()->getId();

        // LOG: Trace the entry point and capture the incoming port
        \Log::info('Login attempt started', [
            'ip' => $request->ip(),
            'host' => $request->getHost(),
            'port' => $request->getPort(),
        ]);

        $request->authenticate();

        // LOG: Confirm user identity and roles after authentication
        \Log::info('Authentication successful', [
            'user_id' => auth()->id(),
            'roles' => auth()->user()->roles->pluck('name'),
            'host' => $request->getHost(),
        ]);

        $request->session()->regenerate();

        // LOG: Trace the new session ID and cookie state
        \Log::info('Session regenerated', [
        ]);

        $user = auth()->user();
        $role = $user->roles->pluck('name')->first() ?? 'user';

        session(['role' => $role]);

        // We pass the guestSessionId we captured at the very beginning.
        // Storefront shoppers carry no store_id of their own, so fall back to
        // the public storefront's store — otherwise a guest cart built before
        // signing in would be orphaned at the moment of login.
        $mergeStoreId = $user->store_id
            ?? app(\App\Services\StorefrontCatalogService::class)->resolveStore()?->id;

        if ($mergeStoreId) {
            app(\App\Services\CartService::class)->mergeGuestCart($user, $mergeStoreId, $guestSessionId);
        }

        // LOG: Confirm the role is stored in the session
        \Log::info('User role set in session', [
            'role' => $role,
        ]);

        if (config('session.driver') === 'database') {
            $request->session()->put('user_id', $user->id);

            // LOG: Database-specific session tracking
            \Log::info('User ID stored in database session', [
                'user_id' => $user->id,
            ]);
        }

        // Determine target host based on config/subdomains.php
        $currentHost = $request->getHost();
        $targetHost = $this->getHostForRole($role);

        // --- CRITICAL DIAGNOSTIC LOG ---
        \Log::debug('ROUTING DIAGNOSIS', [
            'detected_role' => $role,
            'current_host_string' => $currentHost,
            'target_host_string' => $targetHost,
            'hosts_match_exactly' => ($targetHost === $currentHost) ? 'YES' : 'NO',
        ]);

        // REDIRECT LOGIC: Handle cross-subdomain jumps
        // We removed the 'separatedSessionHosts' check here to force the jump
        if ($targetHost && $targetHost !== $currentHost) {

            $protocol = $request->isSecure() ? 'https://' : 'http://';
            $port = $request->getPort();
            $portSuffix = ($port && !in_array($port, [80, 443])) ? ":{$port}" : "";

            // Build the absolute URL for the correct subdomain
            // Preserve the originally intended path (e.g. /canvas) rather than always going to /dashboard
            $intendedPath = $request->session()->get('url.intended')
                ? parse_url($request->session()->get('url.intended'), PHP_URL_PATH)
                : '/dashboard';
            $url = $protocol . $targetHost . $portSuffix . $intendedPath;

            // LOG: Specifically trace the redirection to the new domain
            \Log::warning('Subdomain mismatch - Redirecting user', [
                'user_id' => $user->id,
                'from' => $currentHost,
                'to' => $targetHost,
                'full_url' => $url,
            ]);

            \Log::error('CONTROLLER REDIRECT: Sending user to target host', [
                'target_host' => $targetHost,
                'current_host' => $currentHost,
                'url' => $url
            ]);

            // Clean up session before leaving ONLY for isolated domains
            if (config('subdomains.separated_session_hosts', false)) {
                Auth::guard('web')->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return redirect()->away($url);
        }

        // LOG: Fallback for when the user is already on the correct subdomain
        \Log::info('Login process complete, redirecting', [
            'redirect_to' => '/dashboard',
            'user_id' => $user->id,
        ]);

        // Redirect back to the page the user originally tried to visit (e.g. /canvas),
        // falling back to /dashboard if no intended URL was stored.
        return redirect()->intended('/dashboard');
    }

    /**
     * Helper to find the primary host for a specific role.
     */
    protected function getHostForRole(string $role): ?string
    {
        // Search the host_role_map config to find the subdomain host assigned to this role
        $roleMap = config('subdomains.host_role_map', []);
        $matchedHost = array_search($role, $roleMap, true);

        // If no specific subdomain is mapped for this role (e.g., standard users), 
        // return null so they stay on the main domain.
        return $matchedHost ?: null;
    }

    private function expectedRoleForHost(string $host): ?string
    {
        return config("subdomains.host_role_map.{$host}");
    }

    private function loginComponentForHost(string $host): string
    {
        return config("subdomains.host_component_map.{$host}", 'Auth/Login/index');
    }

    private function loginUrl(Request $request): string
    {
        return $request->getSchemeAndHttpHost() . '/login';
    }

    private function separatedSessionHosts(): bool
    {
        return (bool) config('subdomains.separated_session_hosts', false);
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();

        $request->session()->regenerateToken();

        // Sign-out lands on the login page of the app the user signed out
        // of (seller.…/login), or the main landing off a role subdomain. A
        // bare redirect('/') stayed inside a workspace they no longer have a
        // session for. Inertia::location makes it a full-page visit: an
        // Inertia request cannot follow a plain redirect to another host,
        // so sign-out used to look like it did nothing.
        return Inertia::location($this->signedOutUrl($request));
    }

    /** The current role app's /login, or the main domain's root. */
    private function signedOutUrl(Request $request): string
    {
        $baseDomain = (string) config('app.system_domain', config('subdomains.base_domain', 'duka.local'));
        $host = $request->getHost();

        if ($host === $baseDomain || ! str_ends_with($host, '.'.$baseDomain)) {
            return $this->mainLandingUrl($request);
        }

        $port = $request->getPort();
        $portSuffix = ($port && ! in_array($port, [80, 443], true)) ? ":{$port}" : '';

        return ($request->isSecure() ? 'https://' : 'http://').$host.$portSuffix.'/login';
    }

    /**
     * Root of the main domain, preserving scheme and any non-standard port.
     */
    private function mainLandingUrl(Request $request): string
    {
        $baseDomain = config('app.system_domain', config('subdomains.base_domain', 'duka.local'));
        $scheme = $request->isSecure() ? 'https://' : 'http://';
        $port = $request->getPort();
        $portSuffix = ($port && ! in_array($port, [80, 443], true)) ? ":{$port}" : '';

        return $scheme . $baseDomain . $portSuffix . '/';
    }
}
