<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Admin\ActiveStore;
use App\Services\Admin\AdminAreas;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keep store admins out of the global zone: Items, Fleet, Stores, Warehouses,
 * sessions. Hiding the sidebar link is not enough; a typed URL must 403 too.
 *
 * `admin.global:items` names the area (AdminAreas) a global admin may tick on
 * for one store admin; a plain `admin.global` (users, sessions, the system)
 * is a global admin's alone.
 */
class EnsureGlobalAdmin
{
    public function __construct(private readonly ActiveStore $activeStore, private readonly AdminAreas $areas)
    {
    }

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next, ?string $area = null): Response
    {
        $allowed = $this->activeStore->isGlobal()
            || ($area !== null && $this->areas->allows($request->user(), $area));
        abort_unless($allowed, 403, 'Only a global admin can open this.');

        return $next($request);
    }
}
