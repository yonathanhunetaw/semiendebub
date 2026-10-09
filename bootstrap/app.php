<?php

use App\Http\Middleware\AllowSubdomainLogin;
use App\Http\Middleware\EnsureCorrectSubdomainRole;
use App\Http\Middleware\EnsureGuestSubdomainRole;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\NotifyPublicVisit;
use App\Http\Middleware\ScopeSessionToHost;
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
        web: __DIR__ . '/../routes/web.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(at: '*');

        // Add the CSRF exclusion here
        $middleware->validateCsrfTokens(except: [
            'login',
        ]);

        // $middleware->prepend(ScopeSessionToHost::class);

        $middleware->alias([
            'role' => RoleMiddleware::class,
            'role.subdomain' => EnsureCorrectSubdomainRole::class,
            'guest.subdomain' => EnsureGuestSubdomainRole::class,
            'guest.subdomain.login' => AllowSubdomainLogin::class,
            'notify.public.visit' => NotifyPublicVisit::class,
            'admin.store' => \App\Http\Middleware\ResolveActiveStore::class,
            'admin.global' => \App\Http\Middleware\EnsureGlobalAdmin::class,
            'admin.store.record' => \App\Http\Middleware\EnsureStoreRecordInScope::class,
        ]);

        $middleware->web(append: [
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        Integration::handles($exceptions);

        /*
         * The stock gateway refuses a move a location cannot cover rather than
         * clamping it (STOCK_PLAN.md §3.1). On a web form that is a user
         * mistake, not a crash: send them back with the reason. JSON callers
         * get a 422. Not reported — it is an expected business refusal.
         */
        $exceptions->dontReport(\App\Exceptions\InsufficientStockException::class);
        $exceptions->dontReport(\App\Exceptions\MovementDomainException::class);
        // A movement-rule refusal (wrong domain, no courier, not a manager of
        // that location) is the same kind of answer.
        $exceptions->render(function (\App\Exceptions\MovementDomainException $e, Request $request) {
            if ($request->expectsJson() && ! $request->header('X-Inertia')) {
                return response()->json(['message' => $e->getMessage()], 422);
            }

            return back()->with('error', $e->getMessage());
        });
        $exceptions->render(function (\App\Exceptions\InsufficientStockException $e, Request $request) {
            if ($request->expectsJson() && ! $request->header('X-Inertia')) {
                return response()->json(['message' => $e->getMessage()], 422);
            }

            return back()->with('error', $e->getMessage());
        });

        $exceptions->context(function (): array {
            // 🛑 Check if the 'request' binding exists in the container
            if (!app()->bound('request')) {
                return [];
            }
            $request = request();

            if (!$request instanceof Request) {
                return [];
            }

            $host = (string) $request->getHost();
            $systemDomain = (string) config('app.system_domain');
            $subdomain = 'root';

            if ($systemDomain !== '' && $host !== '' && $host !== $systemDomain) {
                $suffix = '.' . $systemDomain;

                if (str_ends_with($host, $suffix)) {
                    $subdomain = substr($host, 0, -strlen($suffix));
                }
            }

            return [
                'request' => [
                    'host' => $host,
                    'path' => '/' . ltrim($request->path(), '/'),
                    'method' => $request->method(),
                    'subdomain' => $subdomain,
                ],
            ];
        });

        $exceptions->reportable(function (\Throwable $e) {
            if (!app()->bound('sentry')) {
                return;
            }

            // 🛑 Check if the 'request' binding exists in the container
            if (!app()->bound('request')) {
                return;
            }

            $request = request();

            \Sentry\configureScope(function (Scope $scope) use ($request): void {
                if (!$request instanceof Request) {
                    return;
                }

                $host = (string) $request->getHost();
                $systemDomain = (string) config('app.system_domain');
                $subdomain = 'root';

                if ($systemDomain !== '' && $host !== '' && $host !== $systemDomain) {
                    $suffix = '.' . $systemDomain;

                    if (str_ends_with($host, $suffix)) {
                        $subdomain = substr($host, 0, -strlen($suffix));
                    }
                }

                $scope->setTag('app_env', (string) app()->environment());
                $scope->setTag('app_host', $host);
                $scope->setTag('app_subdomain', $subdomain);
                $scope->setTag('app_path', '/' . ltrim($request->path(), '/'));

                if ($user = $request->user()) {
                    $scope->setUser([
                        'id' => (string) $user->getAuthIdentifier(),
                        'email' => $user->email ?? null,
                    ]);
                }
            });
        });
    })->create();
