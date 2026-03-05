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
        $request->authenticate();

        $request->session()->regenerate();

        $user = auth()->user();

        $role = $user->roles->pluck('name')->first() ?? 'user';

        session(['role' => $role]);

        if (config('session.driver') === 'database') {
            $request->session()->put('user_id', $user->id);
        }

        $expectedRole = $this->expectedRoleForHost($request->getHost());

        if ($expectedRole && $expectedRole !== $role) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect()
                ->to($this->loginUrl($request))
                ->withErrors(['email' => 'This account does not have access to this subdomain.']);
        }

        return redirect()->intended('/dashboard');

    }

    private function expectedRoleForHost(string $host): ?string
    {
        $hostToRole = [
            'admin.duka.local' => 'admin',
            'delivery.duka.local' => 'delivery',
            'dev.duka.local' => 'dev',
            'finance.duka.local' => 'finance',
            'guest.duka.local' => 'guest',
            'marketing.duka.local' => 'marketing',
            'procurement.duka.local' => 'procurement',
            'seller.duka.local' => 'seller',
            'shared.duka.local' => 'shared',
            'stock.duka.local' => 'stock_keeper',
            'stockkeeper.duka.local' => 'stock_keeper',
            'vendor.duka.local' => 'vendor',
        ];

        return $hostToRole[$host] ?? null;
    }

    private function loginComponentForHost(string $host): string
    {
        $hostToComponent = [
            'admin.duka.local' => 'Admin/Login/index',
            'delivery.duka.local' => 'Delivery/Login/index',
            'dev.duka.local' => 'Dev/Login/index',
            'finance.duka.local' => 'Finance/Login/index',
            'guest.duka.local' => 'Guest/Login/index',
            'marketing.duka.local' => 'Marketing/Login/index',
            'procurement.duka.local' => 'Procurement/Login/index',
            'seller.duka.local' => 'Seller/Login/index',
            'shared.duka.local' => 'Shared/Login/index',
            'stock.duka.local' => 'StockKeeper/Login/index',
            'stockkeeper.duka.local' => 'StockKeeper/Login/index',
            'vendor.duka.local' => 'Vendor/Login/index',
        ];

        return $hostToComponent[$host] ?? 'Auth/Login';
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
