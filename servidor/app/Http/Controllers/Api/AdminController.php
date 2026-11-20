<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Excecoes\PedidoInvalido;
use App\Http\Controllers\Controller;
use App\Servicos\Admin;
use App\Servicos\Auditor;
use App\Servicos\Convites;
use App\Servicos\Planos;
use App\Suporte\Entrada;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class AdminController extends Controller
{
    public function __construct(
        private readonly Admin $admin,
        private readonly Planos $planos,
        private readonly Convites $convites,
        private readonly Auditor $auditor,
    ) {
    }

    public function entrar(Request $pedido): JsonResponse
    {
        $token = $pedido->input('token');
        if (! is_string($token) || $token === '' || strlen($token) > 100) {
            throw new PedidoInvalido('link_invalido', 'Link inválido ou vencido. Gere outro no servidor.', 401);
        }

        return response()->json($this->admin->entrar($token, $pedido));
    }

    public function sair(Request $pedido): JsonResponse
    {
        $this->admin->sair((string) $pedido->attributes->get('admin_sessao'));

        return response()->json(['ok' => true]);
    }

    public function resumo(): JsonResponse
    {
        return response()->json($this->admin->resumo());
    }

    public function cofres(): JsonResponse
    {
        return response()->json(['cofres' => $this->admin->cofres()]);
    }

    public function convites(): JsonResponse
    {
        return response()->json(['convites' => $this->admin->convites()]);
    }

    public function criarConvite(Request $pedido): JsonResponse
    {
        $plano = (string) $pedido->input('plano_id', 'completo');
        $usos = min(1000, max(1, (int) $pedido->input('usos', 1)));
        $dias = (int) $pedido->input('dias', 30);
        $obs = $pedido->input('observacao');
        $codigo = $this->convites->criar($plano, $usos, $dias > 0 ? min($dias, 365) : null, is_string($obs) && $obs !== '' ? $obs : null);
        $this->auditor->registrar(null, 'admin.convite', 'criado', $pedido);

        return response()->json(['codigo' => $codigo], 201);
    }

    public function encerrarConvite(Request $pedido, int $id): JsonResponse
    {
        $this->admin->encerrarConvite($id);
        $this->auditor->registrar(null, 'admin.convite', 'encerrado', $pedido);

        return response()->json(['ok' => true]);
    }

    public function plano(Request $pedido, string $id): JsonResponse
    {
        $id = $this->cofre($id);
        $ate = $pedido->input('valido_ate');
        try {
            $validoAte = is_string($ate) && $ate !== '' ? Carbon::parse($ate)->endOfDay() : null;
        } catch (\Throwable) {
            throw new PedidoInvalido('formato_invalido', 'Data inválida.');
        }
        $this->planos->definir($id, (string) $pedido->input('plano_id'), $validoAte);
        $this->auditor->registrar($id, 'admin.plano', 'ok', $pedido);

        return response()->json(['situacao' => $this->planos->situacao($id)]);
    }

    public function bloqueio(Request $pedido, string $id): JsonResponse
    {
        $id = $this->cofre($id);
        $this->planos->bloquear($id, $pedido->boolean('bloquear'));
        $this->auditor->registrar($id, 'admin.bloqueio', $pedido->boolean('bloquear') ? 'sim' : 'nao', $pedido);

        return response()->json(['situacao' => $this->planos->situacao($id)]);
    }

    private function cofre(string $id): string
    {
        $id = Entrada::hex($id, 16);
        if (! DB::table('cofres')->where('id', $id)->exists()) {
            throw new PedidoInvalido('nao_encontrado', 'Cofre não encontrado.', 404);
        }

        return $id;
    }
}
