<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class ScopeSessionToHost
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // 1. Generate a unique cookie name based on the current host
        $host = $request->getHost();
        $cookieName = Str::slug(config('app.name', 'laravel').'_'.$host.'_session', '_');

        // 2. Override the session configuration dynamically
        config([
            'session.cookie' => $cookieName,
            'session.domain' => null,
        ]);

        // 3. FORCE the Session Manager to use the new cookie name
        // This is the critical step to ensure it doesn't default back to 'duka_session'
        $request->session()->setName($cookieName);

        return $next($request);
    }
}