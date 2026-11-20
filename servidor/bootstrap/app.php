<?php

use App\Excecoes\ConflitoItem;
use App\Excecoes\PedidoInvalido;
use App\Http\Middleware\AutenticarConta;
use App\Http\Middleware\AutenticarToken;
use App\Http\Middleware\CabecalhosSeguranca;
use App\Http\Middleware\RestricaoIpGlobal;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        apiPrefix: 'v1',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->trustProxies(at: '127.0.0.1');
        $middleware->prepend(CabecalhosSeguranca::class);
        $middleware->api(append: [
            RestricaoIpGlobal::class,
            'throttle:api',
        ]);
        $middleware->alias([
            'token' => AutenticarToken::class,
            'conta' => AutenticarConta::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (PedidoInvalido $erro) {
            return response()->json([
                'erro' => $erro->codigo,
                'mensagem' => $erro->getMessage(),
            ], $erro->status);
        });
        $exceptions->render(function (ConflitoItem $erro) {
            return response()->json([
                'erro' => 'conflito',
                'item' => $erro->item,
            ], 409);
        });
    })->create();
