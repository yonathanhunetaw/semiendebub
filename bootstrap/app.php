<?php

use App\Http\Middleware\AllowSubdomainLogin;
use App\Http\Middleware\EnsureCorrectSubdomainRole;
use App\Http\Middleware\EnsureGuestSubdomainRole;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\NotifyPublicVisit;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Sentry\Laravel\Integration;
use Spatie\Permission\Middleware\RoleMiddleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => RoleMiddleware::class,
            'role.subdomain' => EnsureCorrectSubdomainRole::class,
            'guest.subdomain' => EnsureGuestSubdomainRole::class,
            'guest.subdomain.login' => AllowSubdomainLogin::class,
            'notify.public.visit' => NotifyPublicVisit::class,
        ]);

        $middleware->web(append: [
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->web(append: [
            HandleInertiaRequests::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        Integration::handles($exceptions);
    })->create();
