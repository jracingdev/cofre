<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Servicos\Rede;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class RestricaoIpGlobal
{
    public function __construct(private readonly Rede $rede)
    {
    }

    public function handle(Request $pedido, Closure $proximo): Response
    {
        $this->rede->exigirGlobal($pedido);

        return $proximo($pedido);
    }
}
