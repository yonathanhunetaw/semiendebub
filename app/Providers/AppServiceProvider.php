<?php

namespace App\Providers;

use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\URL;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (app()->environment('production')) {
            URL::forceScheme('https');
        }
        Vite::prefetch(concurrency: 3);

        \Illuminate\Support\Facades\Session::extend('database', function ($app) {
            $table = config('session.table');
            $lifetime = config('session.lifetime');
            $connection = $app['db']->connection(config('session.connection'));

            return new \App\Extensions\CustomDatabaseSessionHandler(
                $connection, $table, $lifetime, $app
            );
        });
    }
}
