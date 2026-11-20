<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Excecoes\PedidoInvalido;
use App\Http\Controllers\Controller;
use App\Models\CofreRegistro;
use App\Servicos\Contas;
use App\Servicos\Planos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ContaController extends Controller
{
    public function __construct(
        private readonly Contas $contas,
        private readonly Planos $planos,
    ) {
    }

    /** Pedido sem sessão: manda link para quem já tem conta. Responde igual exista ou não. */
    public function link(Request $pedido): JsonResponse
    {
        $this->contas->enviarLink(Contas::email($pedido->input('email')), 'entrar', null, $pedido);

        return response()->json(['enviado' => true], 202);
    }

    /** Pedido de dentro do cofre aberto: liga este cofre à conta do e-mail (cria a conta se preciso). */
    public function vincular(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        $this->contas->enviarLink(Contas::email($pedido->input('email')), 'vincular', $cofre->id, $pedido);

        return response()->json(['enviado' => true], 202);
    }

    public function entrar(Request $pedido): JsonResponse
    {
        $token = $pedido->input('token');
        if (! is_string($token) || $token === '' || strlen($token) > 100) {
            throw new PedidoInvalido('link_invalido', 'Link inválido ou vencido. Peça outro.', 401);
        }

        return response()->json($this->contas->entrar($token, $pedido->boolean('aceito_termos'), $pedido));
    }

    public function mostrar(Request $pedido): JsonResponse
    {
        return response()->json($this->contas->resumo((string) $pedido->attributes->get('conta_id')));
    }

    public function excluir(Request $pedido): JsonResponse
    {
        if ($pedido->input('confirmacao') !== 'EXCLUIR') {
            throw new PedidoInvalido('confirmacao_necessaria', 'Digite EXCLUIR para confirmar.');
        }
        $quando = $this->contas->agendarExclusao((string) $pedido->attributes->get('conta_id'), $pedido);

        return response()->json(['excluir_em' => $quando]);
    }

    public function manter(Request $pedido): JsonResponse
    {
        $this->contas->cancelarExclusao((string) $pedido->attributes->get('conta_id'), $pedido);

        return response()->json(['excluir_em' => null]);
    }

    public function sair(Request $pedido): JsonResponse
    {
        $this->contas->sair((string) $pedido->attributes->get('conta_sessao_id'));

        return response()->json(['ok' => true]);
    }

    /** Plano, limites e uso do cofre da sessão. Para o app mostrar "x de y itens". */
    public function uso(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');

        return response()->json([
            'situacao' => $this->planos->situacao($cofre->id),
            'uso' => $this->planos->uso($cofre->id),
        ]);
    }
}
