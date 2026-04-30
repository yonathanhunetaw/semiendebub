<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\RedirectResponse;

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
            'email' => $request->email,
            'ip' => $request->ip(),
            'host' => $request->getHost(),
            'port' => $request->getPort(),
            'request_cookies' => $request->cookies->all(),
        ]);

        $request->authenticate();

        // LOG: Confirm user identity and roles after authentication
        \Log::info('Authentication successful', [
            'user_id' => auth()->id(),
            'roles' => auth()->user()->roles->pluck('name'),
            'host' => $request->getHost(),
            'request_cookies' => $request->cookies->all(),
        ]);

        $request->session()->regenerate();

        // LOG: Trace the new session ID and cookie state
        \Log::info('Session regenerated', [
            'session_id' => $request->session()->getId(),
            'request_cookies' => $request->cookies->all(),
            'set_cookie' => $request->session()->getName() . '=' . $request->session()->getId(),
        ]);

        $user = auth()->user();
        $role = $user->roles->pluck('name')->first() ?? 'user';

        session(['role' => $role]);

        // We pass the guestSessionId we captured at the very beginning
        if ($user->store_id) {
            app(\App\Services\CartService::class)->mergeGuestCart($user, $user->store_id, $guestSessionId);
        }

        // LOG: Confirm the role is stored in the session
        \Log::info('User role set in session', [
            'role' => $role,
            'session_id' => $request->session()->getId(),
            'request_cookies' => $request->cookies->all(),
        ]);

        if (config('session.driver') === 'database') {
            $request->session()->put('user_id', $user->id);

            // LOG: Database-specific session tracking
            \Log::info('User ID stored in database session', [
                'user_id' => $user->id,
                'session_id' => $request->session()->getId(),
                'request_cookies' => $request->cookies->all(),
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
            $url = $protocol . $targetHost . $portSuffix . '/dashboard';

            // LOG: Specifically trace the redirection to the new domain
            \Log::warning('Subdomain mismatch - Redirecting user', [
                'user_id' => $user->id,
                'from' => $currentHost,
                'to' => $targetHost,
                'full_url' => $url,
                'request_cookies' => $request->cookies->all(),
            ]);

            \Log::error('CONTROLLER REDIRECT: Sending user to target host', [
                'target_host' => $targetHost,
                'current_host' => $currentHost,
                'url' => $url
            ]);

            // Clean up session before leaving for isolated domains
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return Inertia::location($url);
        }

        // LOG: Fallback for when the user is already on the correct subdomain
        \Log::info('Login process complete, redirecting', [
            'redirect_to' => '/dashboard',
            'user_id' => $user->id,
            'session_id' => $request->session()->getId(),
            'request_cookies' => $request->cookies->all(),
        ]);

        // Prevent "intended" logic from hijacking the final destination
        $request->session()->forget('url.intended');

        return redirect('/dashboard');
    }

    /**
     * Helper to find the primary host for a specific role.
     */
    private function getHostForRole(string $role): ?string
    {
        $map = config('subdomains.host_role_map', []);

        foreach ($map as $host => $mappedRole) {
            // Use strtolower to ensure "Admin" matches "admin"
            if (strtolower($mappedRole) === strtolower($role)) {
                return $host;
            }
        }
        return null;
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
    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();

        $request->session()->regenerateToken();

        return redirect('/');
    }
}
