<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Excecoes\PedidoInvalido;
use App\Http\Controllers\Controller;
use App\Models\CofreRegistro;
use App\Models\SessaoAparelho;
use App\Servicos\Autenticacao;
use App\Servicos\Fatores;
use App\Servicos\Rede;
use App\Suporte\Entrada;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class AuthController extends Controller
{
    public function __construct(
        private readonly Autenticacao $autenticacao,
        private readonly Fatores $fatores,
        private readonly Rede $rede,
    ) {
    }

    public function desafio(Request $pedido): JsonResponse
    {
        $cofre = $this->cofre($pedido->input('cofre_id'), $pedido);

        return response()->json($this->autenticacao->desafio($cofre, $pedido));
    }

    public function responder(Request $pedido): JsonResponse
    {
        $id = $pedido->input('desafio_id');
        $assinatura = $pedido->input('assinatura');
        if (! is_string($id) || ! is_string($assinatura)) {
            throw new PedidoInvalido('formato_invalido', 'Desafio incompleto.');
        }
        $aparelho = Entrada::hex($pedido->input('aparelho_id'), 16);
        $nome = Entrada::nome(is_string($pedido->input('nome')) ? $pedido->input('nome') : null);

        return response()->json($this->autenticacao->responder($id, $assinatura, $aparelho, $nome, $pedido));
    }

    public function totp(Request $pedido): JsonResponse
    {
        return $this->concluir($pedido, function (CofreRegistro $cofre) use ($pedido) {
            $codigo = $pedido->input('codigo');
            if (! is_string($codigo) || ! $this->fatores->totpConfere($cofre->id, $codigo)) {
                throw new PedidoInvalido('autenticacao_falhou', 'Código inválido.', 401);
            }
        });
    }

    public function recuperacao(Request $pedido): JsonResponse
    {
        return $this->concluir($pedido, function (CofreRegistro $cofre) use ($pedido) {
            $codigo = $pedido->input('codigo');
            if (! is_string($codigo) || ! $this->fatores->gastarRecuperacao($cofre->id, $codigo)) {
                throw new PedidoInvalido('autenticacao_falhou', 'Código inválido.', 401);
            }
        });
    }

    public function sessoes(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');

        return response()->json(['sessoes' => $this->autenticacao->listar($cofre)]);
    }

    public function revogar(Request $pedido, string $id): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        $this->autenticacao->revogar($cofre, $id, $pedido);

        return response()->json(['ok' => true]);
    }

    public function sair(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        /** @var SessaoAparelho $sessao */
        $sessao = $pedido->attributes->get('sessao');
        $this->autenticacao->sair($cofre, $sessao, $pedido);

        return response()->json(['ok' => true]);
    }

    private function cofre(mixed $id, Request $pedido): CofreRegistro
    {
        $id = Entrada::hex($id, 16);
        $cofre = CofreRegistro::query()->find($id);
        if ($cofre === null) {
            throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível autenticar.', 401);
        }
        $this->rede->exigirCofre($pedido, $cofre);

        return $cofre;
    }

    private function concluir(Request $pedido, callable $checar): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        /** @var SessaoAparelho $sessao */
        $sessao = $pedido->attributes->get('sessao');
        $checar($cofre);

        return response()->json($this->autenticacao->promover($sessao, $pedido));
    }
}
