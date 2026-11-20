<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Excecoes\PedidoInvalido;
use App\Servicos\Tokens;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/** Sessão da conta (plano, cobrança, exclusão). Não serve para o cofre, e o token do cofre não serve aqui. */
final class AutenticarConta
{
    public function __construct(private readonly Tokens $tokens)
    {
    }

    public function handle(Request $pedido, Closure $proximo): Response
    {
        $token = (string) $pedido->bearerToken();
        if ($token === '') {
            throw new PedidoInvalido('autenticacao_falhou', 'Sessão inválida.', 401);
        }
        try {
            $hash = $this->tokens->hash($token);
        } catch (PedidoInvalido) {
            throw new PedidoInvalido('autenticacao_falhou', 'Sessão inválida.', 401);
        }
        $sessao = DB::table('conta_sessoes')->where('token_hash', $hash)->first();
        if ($sessao === null || $sessao->revogada_em !== null || now()->greaterThan(Carbon::parse($sessao->expira_em))) {
            throw new PedidoInvalido('autenticacao_falhou', 'Sessão inválida.', 401);
        }
        $pedido->attributes->set('conta_id', (string) $sessao->conta_id);
        $pedido->attributes->set('conta_sessao_id', (string) $sessao->id);

        return $proximo($pedido);
    }
}
