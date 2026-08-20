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
        // Skip tracking completely for POST, PUT, DELETE, etc. so logins never hang
        if ($request->isMethod('GET')) {
            try {
                $this->discordVisitNotificationService->notify($request);
            } catch (\Exception $e) {
                // Fail silently in the background if Discord/ip-api times out
                \Log::warning('Discord visit notification failed: ' . $e->getMessage());
            }
        }

        return $next($request);
    }
}