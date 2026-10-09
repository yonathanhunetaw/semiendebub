<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Admin\ActiveStore;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keep store admins out of the global zone: Items, Fleet, Stores, Warehouses,
 * sessions. Hiding the sidebar link is not enough; a typed URL must 403 too.
 */
class EnsureGlobalAdmin
{
    public function __construct(private readonly ActiveStore $activeStore)
    {
    }

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($this->activeStore->isGlobal(), 403, 'Only a global admin can open this.');

        return $next($request);
    }
}
