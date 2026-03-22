<?php

namespace App\Http\Middleware;

use App\Services\DiscordVisitNotificationService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class NotifyPublicVisit
{
    public function __construct(
        private readonly DiscordVisitNotificationService $discordVisitNotificationService
    ) {}

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $this->discordVisitNotificationService->notify($request);

        return $next($request);
    }
}
