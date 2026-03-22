<?php

namespace App\Providers;

use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Events\Registered;
use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Log;

class AuthEventServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->app['events']->listen(Login::class, function (Login $event): void {
            Log::channel('auth')->info('Auth login success', [
                'user_id' => $event->user->getAuthIdentifier(),
                'email' => $event->user->email ?? null,
                'remember' => $event->remember,
                'host' => request()?->getHost(),
                'path' => request() ? '/'.ltrim(request()->path(), '/') : null,
                'ip' => request()?->ip(),
            ]);
        });

        $this->app['events']->listen(Failed::class, function (Failed $event): void {
            Log::channel('auth')->warning('Auth login failed', [
                'email' => $event->credentials['email'] ?? null,
                'host' => request()?->getHost(),
                'path' => request() ? '/'.ltrim(request()->path(), '/') : null,
                'ip' => request()?->ip(),
            ]);
        });

        $this->app['events']->listen(Logout::class, function (Logout $event): void {
            Log::channel('auth')->info('Auth logout', [
                'user_id' => $event->user?->getAuthIdentifier(),
                'email' => $event->user?->email,
                'host' => request()?->getHost(),
                'path' => request() ? '/'.ltrim(request()->path(), '/') : null,
                'ip' => request()?->ip(),
            ]);
        });

        $this->app['events']->listen(Lockout::class, function (Lockout $event): void {
            Log::channel('auth')->warning('Auth lockout', [
                'email' => $event->request->input('email'),
                'host' => $event->request->getHost(),
                'path' => '/'.ltrim($event->request->path(), '/'),
                'ip' => $event->request->ip(),
            ]);
        });

        $this->app['events']->listen(Registered::class, function (Registered $event): void {
            Log::channel('auth')->info('Auth user registered', [
                'user_id' => $event->user->getAuthIdentifier(),
                'email' => $event->user->email ?? null,
                'host' => request()?->getHost(),
                'path' => request() ? '/'.ltrim(request()->path(), '/') : null,
                'ip' => request()?->ip(),
            ]);
        });

        $this->app['events']->listen(PasswordReset::class, function (PasswordReset $event): void {
            Log::channel('auth')->info('Auth password reset', [
                'user_id' => $event->user->getAuthIdentifier(),
                'email' => $event->user->email ?? null,
                'host' => request()?->getHost(),
                'path' => request() ? '/'.ltrim(request()->path(), '/') : null,
                'ip' => request()?->ip(),
            ]);
        });
    }
}
