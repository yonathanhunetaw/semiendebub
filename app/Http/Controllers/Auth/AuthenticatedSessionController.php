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
    public function store(LoginRequest $request)
    {
        // LOG: Trace the entry point and capture the incoming port
        \Log::info('Login attempt started', [
            'email' => $request->email,
            'ip' => $request->ip(),
            'host' => $request->getHost(),
            'port' => $request->getPort(), // ADDED: To track if 8095 is being passed
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

        // LOG: Detailed routing decision
        \Log::info('Expected role for current host check', [
            'current_host' => $currentHost,
            'target_host' => $targetHost,
            'user_role' => $role,
            'request_cookies' => $request->cookies->all(),
        ]);

        // REDIRECT LOGIC: Handle cross-subdomain jumps with custom ports
        if ($targetHost && $targetHost !== $currentHost) {

            // CHANGE: Build the URL specifically for your port (8095)
            $protocol = $request->isSecure() ? 'https://' : 'http://';
            $port = $request->getPort();
            $portSuffix = ($port && !in_array($port, [80, 443])) ? ":{$port}" : "";
            $url = $protocol . $targetHost . $portSuffix . '/dashboard';

            // LOG: Specifically trace the redirection to the new domain
            \Log::warning('Subdomain mismatch - Redirecting user', [
                'user_id' => $user->id,
                'from' => $currentHost,
                'to' => $targetHost,
                'full_url' => $url, // ADDED: To see exactly where the user is sent
                'request_cookies' => $request->cookies->all(),
            ]);

            // CHANGE: Use Inertia::location for hard window redirect
            return Inertia::location($url);
        }

        // LOG: Fallback for when the user is already on the correct subdomain
        \Log::info('Login process complete, redirecting', [
            'redirect_to' => '/dashboard',
            'user_id' => $user->id,
            'session_id' => $request->session()->getId(),
            'request_cookies' => $request->cookies->all(),
        ]);

        return redirect()->intended('/dashboard');
    }

    /**
     * Helper to find the primary host for a specific role.
     */
    private function getHostForRole(string $role): ?string
    {
        $map = config('subdomains.host_role_map');

        // array_search looks for the value ($role) and returns the first key it finds.
        // Since 'stockkeeper.duka.local' is added to the map before 'stock.duka.local',
        // it will return the correct "three-k" version.
        return array_search($role, $map) ?: null;
    }

    private function expectedRoleForHost(string $host): ?string
    {
        return config("subdomains.host_role_map.{$host}");
    }

    private function loginComponentForHost(string $host): string
    {
        return config("subdomains.host_component_map.{$host}", 'Auth/Login');
    }

    private function loginUrl(Request $request): string
    {
        return $request->getSchemeAndHttpHost() . '/login';
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
