<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class ScopeSessionToHost
{
    /**
     * Scope local development sessions to the current host so subdomains can
     * stay logged into different accounts at the same time.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $cookieName = $this->cookieNameForHost($request->getHost());

        config([
            'session.cookie' => $cookieName,
            'session.domain' => null, // Explicitly keep this null
        ]);

        return $next($request);
    }

    private function cookieNameForHost(string $host): string
    {
        return Str::slug(
            (string) config('app.name', 'laravel') . '_' . $host . '_session',
            '_'
        );
    }
}
