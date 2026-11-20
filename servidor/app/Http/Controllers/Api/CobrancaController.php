<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Excecoes\PedidoInvalido;
use App\Http\Controllers\Controller;
use App\Servicos\Cobranca;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CobrancaController extends Controller
{
    public function __construct(private readonly Cobranca $cobranca)
    {
    }

    public function webhook(Request $pedido): JsonResponse
    {
        if ((string) config('broquel.cobranca_segredo') === '') {
            throw new PedidoInvalido('nao_encontrado', 'Recurso não encontrado.', 404);
        }
        $corpo = (string) $pedido->getContent();
        if (strlen($corpo) > 20_000 || ! $this->cobranca->assinaturaValida($corpo, (string) $pedido->header('X-Broquel-Assinatura'))) {
            throw new PedidoInvalido('autenticacao_falhou', 'Assinatura inválida.', 401);
        }
        $evento = json_decode($corpo, true);
        if (! is_array($evento)) {
            throw new PedidoInvalido('formato_invalido', 'Corpo inválido.');
        }

        return response()->json(['resultado' => $this->cobranca->aplicar($evento)]);
    }
}
