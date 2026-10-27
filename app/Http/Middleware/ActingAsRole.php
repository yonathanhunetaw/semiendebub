<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Marks the request as one the user makes in a role that is not their app's
 * own: a seller who is also a stock keeper works in the stock keeping routes
 * mounted under /stock in the seller app. User::roleKey() answers with this
 * role there, so the stock keeper's rules see a stock keeper, not a seller.
 */
final class ActingAsRole
{
    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next, string $role): Response
    {
        $request->attributes->set('acting_role', $role);

        return $next($request);
    }
}
