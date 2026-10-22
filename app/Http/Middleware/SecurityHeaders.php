<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Http\Controllers\Storefront\SeoController;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Browser-hardening headers on every web response, plus X-Robots-Tag on the
 * pages that must never be indexed (sign-in, token links, the downloads list,
 * and every role subdomain).
 *
 * No Content-Security-Policy yet: the Vite/React bundle and Google Analytics
 * need a tuned policy, which should be tried in report-only mode first.
 */
class SecurityHeaders
{
    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');

        if (app()->environment('production')) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000');
        }

        if ($this->isPrivate($request)) {
            $response->headers->set('X-Robots-Tag', 'noindex, nofollow');
        }

        return $response;
    }

    private function isPrivate(Request $request): bool
    {
        $base = (string) config('subdomains.base_domain');

        if ($base !== '' && $request->getHost() !== $base) {
            return true;
        }

        $path = '/' . ltrim($request->path(), '/');

        foreach (SeoController::PRIVATE_PATHS as $private) {
            if (str_starts_with($path, rtrim($private, '/'))) {
                return true;
            }
        }

        return false;
    }
}
