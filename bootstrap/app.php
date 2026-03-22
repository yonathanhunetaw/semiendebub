<?php

use App\Http\Middleware\AllowSubdomainLogin;
use App\Http\Middleware\EnsureCorrectSubdomainRole;
use App\Http\Middleware\EnsureGuestSubdomainRole;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\NotifyPublicVisit;
use App\Providers\AuthEventServiceProvider;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Sentry\Laravel\Integration;
use Sentry\State\Scope;
use Spatie\Permission\Middleware\RoleMiddleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withProviders([
        AuthEventServiceProvider::class,
    ])
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

        $exceptions->context(function (): array {
            $request = request();

            if (! $request instanceof Request) {
                return [];
            }

            $host = (string) $request->getHost();
            $systemDomain = (string) config('app.system_domain');
            $subdomain = 'root';

            if ($systemDomain !== '' && $host !== '' && $host !== $systemDomain) {
                $suffix = '.'.$systemDomain;

                if (str_ends_with($host, $suffix)) {
                    $subdomain = substr($host, 0, -strlen($suffix));
                }
            }

            return [
                'request' => [
                    'host' => $host,
                    'path' => '/'.ltrim($request->path(), '/'),
                    'method' => $request->method(),
                    'subdomain' => $subdomain,
                ],
            ];
        });

        $exceptions->reportable(function (\Throwable $e) {
            if (! app()->bound('sentry')) {
                return;
            }

            $request = request();

            \Sentry\configureScope(function (Scope $scope) use ($request): void {
                if (! $request instanceof Request) {
                    return;
                }

                $host = (string) $request->getHost();
                $systemDomain = (string) config('app.system_domain');
                $subdomain = 'root';

                if ($systemDomain !== '' && $host !== '' && $host !== $systemDomain) {
                    $suffix = '.'.$systemDomain;

                    if (str_ends_with($host, $suffix)) {
                        $subdomain = substr($host, 0, -strlen($suffix));
                    }
                }

                $scope->setTag('app_env', (string) app()->environment());
                $scope->setTag('app_host', $host);
                $scope->setTag('app_subdomain', $subdomain);
                $scope->setTag('app_path', '/'.ltrim($request->path(), '/'));

                if ($user = $request->user()) {
                    $scope->setUser([
                        'id' => (string) $user->getAuthIdentifier(),
                        'email' => $user->email ?? null,
                    ]);
                }
            });
        });
    })->create();
