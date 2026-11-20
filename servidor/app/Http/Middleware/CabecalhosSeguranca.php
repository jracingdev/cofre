<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class CabecalhosSeguranca
{
    public function handle(Request $pedido, Closure $proximo): Response
    {
        $resposta = $proximo($pedido);
        $resposta->headers->set('X-Content-Type-Options', 'nosniff');
        $resposta->headers->set('X-Frame-Options', 'DENY');
        $resposta->headers->set('Referrer-Policy', 'no-referrer');
        $resposta->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        // Só a página inicial traz política própria (também sem nada inline nem de fora). O resto fica com a mais fechada.
        if (! $resposta->headers->has('Content-Security-Policy')) {
            $resposta->headers->set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
        }
        if (! $resposta->headers->has('X-Robots-Tag')) {
            $resposta->headers->set('X-Robots-Tag', 'noindex, nofollow');
        }
        $resposta->headers->removeCacheControlDirective('private');
        $resposta->headers->removeCacheControlDirective('public');
        $resposta->headers->addCacheControlDirective('no-store', true);
        if ($pedido->isSecure()) {
            $resposta->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $resposta;
    }
}
