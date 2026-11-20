<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Excecoes\PedidoInvalido;
use App\Http\Controllers\Controller;
use App\Models\CofreRegistro;
use App\Servicos\Cofres;
use App\Servicos\Fatores;
use App\Servicos\Rede;
use App\Suporte\Entrada;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CofreController extends Controller
{
    public function __construct(
        private readonly Cofres $cofres,
        private readonly Rede $rede,
        private readonly Fatores $fatores,
    ) {
    }

    public function criar(Request $pedido): JsonResponse
    {
        $b64 = $pedido->input('cabecalho');
        if (! is_string($b64)) {
            throw new PedidoInvalido('formato_invalido', 'Cabeçalho ausente.');
        }
        $convite = $pedido->input('convite', $pedido->header('X-Broquel-Convite'));
        $cofre = $this->cofres->registrar($b64, $pedido, is_string($convite) ? mb_substr($convite, 0, 40) : null);

        return response()->json(['cofre_id' => $cofre->id], 201);
    }

    public function mostrar(Request $pedido, string $id): JsonResponse
    {
        $id = Entrada::hex($id, 16);
        $cofre = CofreRegistro::query()->find($id);
        if ($cofre === null) {
            throw new PedidoInvalido('nao_encontrado', 'Cofre não encontrado.', 404);
        }
        $this->rede->exigirCofre($pedido, $cofre);

        return response()->json([
            'cofre_id' => $cofre->id,
            'cabecalho' => $cofre->cabecalho_b64,
        ]);
    }

    public function atualizar(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        $b64 = $pedido->input('cabecalho');
        if (! is_string($b64)) {
            throw new PedidoInvalido('formato_invalido', 'Cabeçalho ausente.');
        }
        $this->cofres->substituir($cofre, $b64, $pedido);

        return response()->json(['cofre_id' => $cofre->id]);
    }

    public function rede(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        $restringir = $pedido->boolean('restringir');
        $ips = $pedido->input('ips', []);
        if (! is_array($ips)) {
            throw new PedidoInvalido('formato_invalido', 'A lista de endereços é inválida.');
        }
        $this->cofres->definirRede($cofre, $restringir, $ips, $pedido);

        return response()->json([
            'restringir' => $cofre->restringir_ip,
            'ips' => $cofre->ips_permitidos,
            'segundo_fator' => $this->fatores->metodos($cofre->id) !== [],
        ]);
    }
}
