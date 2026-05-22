<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class ScopeSessionToHost
{
    public function handle(Request $request, Closure $next): Response
    {
        // 1. Generate unique cookie name
        $host = $request->getHost();
        $cookieName = Str::slug(config('app.name', 'laravel').'_'.$host.'_session', '_');

        // 2. Update config dynamically. 
        // DO NOT call $request->session() here.
        config([
            'session.cookie' => $cookieName,
            'session.domain' => null,
        ]);

        return $next($request);
    }
}