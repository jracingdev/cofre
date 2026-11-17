<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Excecoes\PedidoInvalido;
use App\Http\Controllers\Controller;
use App\Models\CofreRegistro;
use App\Servicos\Auditor;
use App\Servicos\Autenticacao;
use App\Servicos\Fatores;
use App\Servicos\WebAuthn;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SegurancaController extends Controller
{
    public function __construct(
        private readonly Fatores $fatores,
        private readonly WebAuthn $webAuthn,
        private readonly Autenticacao $autenticacao,
        private readonly Auditor $auditor,
    ) {
    }

    public function iniciarTotp(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        $dados = $this->fatores->iniciarTotp($cofre);
        $this->auditor->registrar($cofre->id, 'totp.inicio', 'ok', $pedido);

        return response()->json($dados);
    }

    public function confirmarTotp(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        $codigo = $pedido->input('codigo');
        if (! is_string($codigo)) {
            throw new PedidoInvalido('formato_invalido', 'Código ausente.');
        }
        $recuperacao = $this->fatores->confirmarTotp($cofre, $codigo);
        $this->auditor->registrar($cofre->id, 'totp.confirmado', 'ok', $pedido);

        return response()->json(['codigos_recuperacao' => $recuperacao]);
    }

    public function desligarTotp(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        $codigo = $pedido->input('codigo');
        if (! is_string($codigo)) {
            throw new PedidoInvalido('formato_invalido', 'Código ausente.');
        }
        $this->fatores->desligarTotp($cofre, $codigo);
        $this->auditor->registrar($cofre->id, 'totp.desligado', 'ok', $pedido);

        return response()->json(['ok' => true]);
    }

    public function opcoesRegistro(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');

        return response()->json($this->webAuthn->opcoesRegistro($cofre));
    }

    public function confirmarRegistro(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        $this->cerimonia($pedido, fn (string $id, array $credencial) => $this->webAuthn->confirmarRegistro($cofre, $id, $credencial));
        $this->auditor->registrar($cofre->id, 'webauthn.registro', 'ok', $pedido);

        return response()->json(['ok' => true]);
    }

    public function opcoesLogin(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');

        return response()->json($this->webAuthn->opcoesLogin($cofre));
    }

    public function confirmarLogin(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        $this->cerimonia($pedido, fn (string $id, array $credencial) => $this->webAuthn->confirmarLogin($cofre, $id, $credencial));
        $this->auditor->registrar($cofre->id, 'webauthn.ok', 'ok', $pedido);
        $sessao = $pedido->attributes->get('sessao');

        return response()->json($this->autenticacao->promover($sessao, $pedido));
    }

    private function cerimonia(Request $pedido, callable $acao): void
    {
        $id = $pedido->input('desafio_id');
        $credencial = $pedido->input('credencial');
        if (! is_string($id) || ! is_array($credencial)) {
            throw new PedidoInvalido('formato_invalido', 'Cerimônia incompleta.');
        }
        $acao($id, $credencial);
    }
}
