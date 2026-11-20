<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Excecoes\PedidoInvalido;
use App\Servicos\Admin;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class AutenticarAdmin
{
    public function __construct(private readonly Admin $admin)
    {
    }

    public function handle(Request $pedido, Closure $proximo): Response
    {
        $sessao = $this->admin->sessaoValida((string) $pedido->bearerToken());
        if ($sessao === null) {
            throw new PedidoInvalido('autenticacao_falhou', 'Sessão inválida.', 401);
        }
        $pedido->attributes->set('admin_sessao', $sessao);

        return $proximo($pedido);
    }
}
