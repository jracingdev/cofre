<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Excecoes\PedidoInvalido;
use App\Http\Controllers\Controller;
use App\Models\CofreRegistro;
use App\Servicos\Sincronizacao;
use App\Suporte\Entrada;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ItemController extends Controller
{
    public function __construct(private readonly Sincronizacao $sincronizacao)
    {
    }

    public function index(Request $pedido): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        $cursor = $pedido->query('cursor', 0);
        $limite = $pedido->query('limite', config('broquel.itens_por_pagina'));
        if (! is_numeric($cursor) || (int) $cursor < 0 || ! is_numeric($limite)) {
            throw new PedidoInvalido('formato_invalido', 'Paginação inválida.');
        }

        return response()->json($this->sincronizacao->listar($cofre, (int) $cursor, (int) $limite));
    }

    public function gravar(Request $pedido, string $id): JsonResponse
    {
        /** @var CofreRegistro $cofre */
        $cofre = $pedido->attributes->get('cofre');
        $itemId = Entrada::hex($id, 16);
        $base = $pedido->input('revisao_base');
        $blob = $pedido->input('blob');
        if (! is_int($base) && ! (is_string($base) && preg_match('/^\d+$/', $base) === 1)) {
            throw new PedidoInvalido('formato_invalido', 'Revisão de base inválida.');
        }
        if ((int) $base > 4294967295) {
            throw new PedidoInvalido('formato_invalido', 'Revisão de base inválida.');
        }
        if (! is_string($blob)) {
            throw new PedidoInvalido('formato_invalido', 'Item ausente.');
        }
        $resultado = $this->sincronizacao->gravar($cofre, $itemId, (int) $base, $blob, $pedido);

        return response()->json($resultado['item'], $resultado['criado'] ? 201 : 200);
    }
}
