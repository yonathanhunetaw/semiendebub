<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Admin\ActiveStore;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Settle which store the admin app is looking at for this request.
 *
 * Runs after the subdomain gate, so it only ever sees users allowed into the
 * admin app. The answer is remembered in the session, so plain links keep the
 * store the sidebar dropdown (or the dashboard chips) last picked.
 */
class ResolveActiveStore
{
    public function __construct(private readonly ActiveStore $activeStore)
    {
    }

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $this->activeStore->resolve($request);

        return $next($request);
    }
}
