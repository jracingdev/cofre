<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\ConflitoItem;
use App\Excecoes\PedidoInvalido;
use App\Models\CofreRegistro;
use App\Models\ItemCofre;
use Broquel\Cripto\Cofre;
use Broquel\Cripto\ErroCofre;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class Sincronizacao
{
    public function __construct(
        private readonly Auditor $auditor,
        private readonly Planos $planos,
    ) {
    }

    /** @return array{itens: list<array<string, mixed>>, proximo_cursor: int|null, tem_mais: bool} */
    public function listar(CofreRegistro $cofre, int $cursor, int $limite): array
    {
        $limite = min(max($limite, 1), (int) config('broquel.itens_por_pagina_max'));
        $linhas = ItemCofre::query()
            ->where('cofre_id', $cofre->id)
            ->where('cursor', '>', $cursor)
            ->orderBy('cursor')
            ->limit($limite + 1)
            ->get();
        $temMais = $linhas->count() > $limite;
        $pagina = $linhas->take($limite);

        return [
            'itens' => $pagina->map(fn (ItemCofre $item) => $this->apresentar($item))->all(),
            'proximo_cursor' => $pagina->isEmpty() ? null : (int) $pagina->last()->cursor,
            'tem_mais' => $temMais,
        ];
    }

    /** @return array{criado: bool, item: array<string, mixed>} */
    public function gravar(CofreRegistro $cofre, string $itemId, int $base, string $blobB64, Request $pedido): array
    {
        if (strlen($blobB64) > 2_000_000) {
            throw new PedidoInvalido('limite_excedido', 'O item passa do tamanho máximo.');
        }
        $blob = base64_decode($blobB64, true);
        if ($blob === false) {
            throw new PedidoInvalido('formato_invalido', 'O item não está em base64.');
        }
        try {
            $meta = Cofre::lerPrefixoItem($blob);
        } catch (ErroCofre $erro) {
            $this->auditor->registrar($cofre->id, 'item.recusado', 'formato', $pedido);
            throw new PedidoInvalido($erro->codigo, 'O item não passou na validação do formato.');
        }
        if (! hash_equals($cofre->id, bin2hex($meta['cofreId'])) || ! hash_equals($itemId, bin2hex($meta['itemId']))) {
            $this->auditor->registrar($cofre->id, 'item.recusado', 'formato', $pedido);
            throw new PedidoInvalido('formato_invalido', 'O item não pertence a este endereço.');
        }

        try {
            $resultado = DB::transaction(function () use ($cofre, $itemId, $base, $meta, $blob) {
                $atual = ItemCofre::query()
                    ->where('cofre_id', $cofre->id)
                    ->where('item_id', $itemId)
                    ->lockForUpdate()
                    ->first();
                $this->planos->exigirGravacao(
                    $cofre->id,
                    $atual === null || (bool) $atual->apagado,
                    (bool) $meta['apagado'],
                    strlen(base64_encode($blob)),
                    $atual === null ? 0 : strlen((string) $atual->blob_b64),
                );
                if ($atual === null) {
                    if ($base !== 0 || (int) $meta['revisao'] !== 1) {
                        throw new ConflitoItem(null);
                    }
                    $item = ItemCofre::query()->create([
                        'cofre_id' => $cofre->id,
                        'item_id' => $itemId,
                        'revisao' => 1,
                        'criado_em_ms' => $meta['criadoEm'],
                        'atualizado_em_ms' => $meta['atualizadoEm'],
                        'apagado' => $meta['apagado'],
                        'blob_b64' => base64_encode($blob),
                        'cursor' => $this->proximoCursor(),
                    ]);

                    return ['criado' => true, 'item' => $this->apresentar($item)];
                }
                if ($base !== (int) $atual->revisao || (int) $meta['revisao'] !== (int) $atual->revisao + 1) {
                    throw new ConflitoItem($this->apresentar($atual));
                }
                if ((int) $atual->revisao === 4294967295) {
                    throw new PedidoInvalido('limite_excedido', 'A revisão do item chegou ao limite.');
                }
                $atual->fill([
                    'revisao' => (int) $meta['revisao'],
                    'criado_em_ms' => $meta['criadoEm'],
                    'atualizado_em_ms' => $meta['atualizadoEm'],
                    'apagado' => $meta['apagado'],
                    'blob_b64' => base64_encode($blob),
                    'cursor' => $this->proximoCursor(),
                ])->save();

                return ['criado' => false, 'item' => $this->apresentar($atual)];
            });
        } catch (ConflitoItem $conflito) {
            $this->auditor->registrar($cofre->id, 'item.conflito', 'recusado', $pedido);
            throw $conflito;
        } catch (PedidoInvalido $erro) {
            $this->auditor->registrar($cofre->id, 'item.recusado', substr($erro->codigo, 0, 20), $pedido);
            throw $erro;
        }
        $this->auditor->registrar($cofre->id, 'item.gravado', 'ok', $pedido);

        return $resultado;
    }

    /** @return array<string, mixed> */
    public function apresentar(ItemCofre $item): array
    {
        return [
            'item_id' => $item->item_id,
            'revisao' => (int) $item->revisao,
            'criado_em' => (int) $item->criado_em_ms,
            'atualizado_em' => (int) $item->atualizado_em_ms,
            'apagado' => (bool) $item->apagado,
            'blob' => $item->blob_b64,
            'cursor' => (int) $item->cursor,
        ];
    }

    private function proximoCursor(): int
    {
        $linha = DB::table('contadores')->where('nome', 'sync')->lockForUpdate()->first();
        $valor = ((int) $linha->valor) + 1;
        DB::table('contadores')->where('nome', 'sync')->update(['valor' => $valor]);

        return $valor;
    }
}
