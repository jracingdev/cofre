<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Excecoes\PedidoInvalido;
use App\Models\CofreRegistro;
use App\Models\SessaoAparelho;
use App\Servicos\Rede;
use App\Servicos\Tokens;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class AutenticarToken
{
    public function __construct(
        private readonly Tokens $tokens,
        private readonly Rede $rede,
    ) {
    }

    public function handle(Request $pedido, Closure $proximo, string $tipo): Response
    {
        $cabecalho = (string) $pedido->bearerToken();
        if ($cabecalho === '') {
            throw new PedidoInvalido('autenticacao_falhou', 'Sessão inválida.', 401);
        }
        try {
            $hash = $this->tokens->hash($cabecalho);
        } catch (PedidoInvalido) {
            throw new PedidoInvalido('autenticacao_falhou', 'Sessão inválida.', 401);
        }
        $sessao = SessaoAparelho::query()->where('token_hash', $hash)->first();
        if ($sessao === null || $sessao->tipo !== $tipo || ! $sessao->vigente()) {
            throw new PedidoInvalido('autenticacao_falhou', 'Sessão inválida.', 401);
        }
        $cofre = CofreRegistro::query()->find($sessao->cofre_id);
        if ($cofre === null) {
            throw new PedidoInvalido('autenticacao_falhou', 'Sessão inválida.', 401);
        }
        $this->rede->exigirCofre($pedido, $cofre);
        $pedido->attributes->set('cofre', $cofre);
        $pedido->attributes->set('sessao', $sessao);

        return $proximo($pedido);
    }
}
