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

        // Not logged in → allow login page or public pages
        if (! $user) {
            return $next($request);
        }

        // User has the correct role → allow
        if ($user->hasRole($subdomainRole)) {
            return $next($request);
        }

        // User logged in but role mismatch → redirect to login on current subdomain
        return redirect()->to($this->homeUrl($request));
    }

    private function homeUrl(Request $request): string
    {
        return $request->getSchemeAndHttpHost().'/';
    }
}
