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
        \Log::info('Login attempt started', [
            'email' => $request->email,
            'ip' => $request->ip(),
            'host' => $request->getHost(),
            'request_cookies' => $request->cookies->all(),
        ]);

        $request->authenticate();
        \Log::info('Authentication successful', [
            'user_id' => auth()->id(),
            'roles' => auth()->user()->roles->pluck('name'),
            'host' => $request->getHost(),
            'request_cookies' => $request->cookies->all(),
        ]);

        $request->session()->regenerate();
        \Log::info('Session regenerated', [
            'session_id' => $request->session()->getId(),
            'request_cookies' => $request->cookies->all(),
            'set_cookie' => $request->session()->getName().'='.$request->session()->getId(),
        ]);

        $user = auth()->user();
        $role = $user->roles->pluck('name')->first() ?? 'user';
        session(['role' => $role]);

        \Log::info('User role set in session', [
            'role' => $role,
            'session_id' => $request->session()->getId(),
            'request_cookies' => $request->cookies->all(),
        ]);

        if (config('session.driver') === 'database') {
            $request->session()->put('user_id', $user->id);
            \Log::info('User ID stored in database session', [
                'user_id' => $user->id,
                'session_id' => $request->session()->getId(),
                'request_cookies' => $request->cookies->all(),
            ]);
        }

        $expectedRole = $this->expectedRoleForHost($request->getHost());
        \Log::info('Expected role for current host', [
            'host' => $request->getHost(),
            'expected_role' => $expectedRole,
            'user_role' => $role,
            'request_cookies' => $request->cookies->all(),
        ]);

        if ($expectedRole && $expectedRole !== $role) {
            \Log::warning('Role mismatch, logging out user', [
                'user_id' => $user->id,
                'user_role' => $role,
                'expected_role' => $expectedRole,
                'host' => $request->getHost(),
                'request_cookies' => $request->cookies->all(),
            ]);

            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect()
                ->to($this->loginUrl($request))
                ->withErrors(['email' => 'This account does not have access to this subdomain.']);
        }

        \Log::info('Login process complete, redirecting', [
            'redirect_to' => '/dashboard',
            'user_id' => $user->id,
            'session_id' => $request->session()->getId(),
            'request_cookies' => $request->cookies->all(),
        ]);

        return redirect()->intended('/dashboard');
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
        return $request->getSchemeAndHttpHost().'/login';
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
