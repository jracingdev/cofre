<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

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
        RateLimiter::for('api', function (Request $pedido) {
            return Limit::perMinute((int) config('broquel.limite_api'))->by((string) $pedido->ip());
        });
        RateLimiter::for('auth', function (Request $pedido) {
            return Limit::perMinute((int) config('broquel.limite_auth'))->by((string) $pedido->ip());
        });
    }
}
