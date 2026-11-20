<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\PedidoInvalido;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Plano, limites e uso de cada cofre. Só conta linhas e bytes cifrados, nunca lê conteúdo. */
final class Planos
{
    /** @return array{id: string, nome: string, max_itens: int|null, max_bytes: int|null, max_aparelhos: int|null} */
    public function plano(string $planoId): array
    {
        $linha = DB::table('planos')->where('id', $planoId)->first();
        if ($linha === null) {
            throw new PedidoInvalido('plano_invalido', 'Plano desconhecido.');
        }

        return [
            'id' => (string) $linha->id,
            'nome' => (string) $linha->nome,
            'max_itens' => $linha->max_itens === null ? null : (int) $linha->max_itens,
            'max_bytes' => $linha->max_bytes === null ? null : (int) $linha->max_bytes,
            'max_aparelhos' => $linha->max_aparelhos === null ? null : (int) $linha->max_aparelhos,
        ];
    }

    /** @return array{plano: array<string, mixed>, valido_ate: string|null, bloqueado: bool, somente_leitura: bool} */
    public function situacao(string $cofreId): array
    {
        $linha = DB::table('cofre_planos')->where('cofre_id', $cofreId)->first();
        $planoId = $linha?->plano_id ?? (string) config('broquel.plano_sem_registro');
        $validoAte = $linha?->valido_ate ? Carbon::parse($linha->valido_ate) : null;
        $bloqueado = (bool) ($linha?->bloqueado ?? false);
        $vencido = $validoAte !== null
            && $validoAte->copy()->addDays((int) config('broquel.carencia_dias'))->isPast();

        return [
            'plano' => $this->plano($planoId),
            'valido_ate' => $validoAte?->toIso8601String(),
            'bloqueado' => $bloqueado,
            'somente_leitura' => $bloqueado || $vencido,
        ];
    }

    public function definir(string $cofreId, string $planoId, ?Carbon $validoAte): void
    {
        $this->plano($planoId);
        DB::table('cofre_planos')->updateOrInsert(
            ['cofre_id' => $cofreId],
            ['plano_id' => $planoId, 'valido_ate' => $validoAte, 'updated_at' => now(), 'created_at' => now()],
        );
    }

    public function bloquear(string $cofreId, bool $bloquear): void
    {
        $atual = DB::table('cofre_planos')->where('cofre_id', $cofreId)->first();
        if ($atual === null) {
            $this->definir($cofreId, (string) config('broquel.plano_sem_registro'), null);
        }
        DB::table('cofre_planos')->where('cofre_id', $cofreId)->update(['bloqueado' => $bloquear, 'updated_at' => now()]);
    }

    /** @return array{itens: int, bytes: int, aparelhos: int} */
    public function uso(string $cofreId): array
    {
        $itens = DB::table('itens')->where('cofre_id', $cofreId)->where('apagado', false);

        return [
            'itens' => (int) (clone $itens)->count(),
            'bytes' => (int) DB::table('itens')->where('cofre_id', $cofreId)->sum(DB::raw('LENGTH(blob_b64)')),
            'aparelhos' => $this->aparelhos($cofreId),
        ];
    }

    /**
     * Chamado antes de gravar um item.
     * $tamanho é o tamanho do blob em base64; $tamanhoAnterior é o do item atual (0 se novo).
     */
    public function exigirGravacao(string $cofreId, bool $novo, bool $apagado, int $tamanho, int $tamanhoAnterior): void
    {
        $situacao = $this->situacao($cofreId);
        if ($situacao['somente_leitura']) {
            throw new PedidoInvalido('somente_leitura', 'O cofre está somente leitura. Regularize o plano para voltar a gravar.', 403);
        }
        $plano = $situacao['plano'];
        if ($plano['max_itens'] !== null && $novo && ! $apagado) {
            $ativos = DB::table('itens')->where('cofre_id', $cofreId)->where('apagado', false)->count();
            if ($ativos >= $plano['max_itens']) {
                throw new PedidoInvalido('limite_excedido', 'O plano chegou ao número máximo de itens.', 403);
            }
        }
        if ($plano['max_bytes'] !== null && $tamanho > $tamanhoAnterior) {
            $usados = (int) DB::table('itens')->where('cofre_id', $cofreId)->sum(DB::raw('LENGTH(blob_b64)'));
            if ($usados - $tamanhoAnterior + $tamanho > $plano['max_bytes']) {
                throw new PedidoInvalido('limite_excedido', 'O plano chegou ao espaço máximo.', 403);
            }
        }
    }

    /** Chamado antes de abrir sessão. Aparelho já conhecido sempre entra. */
    public function exigirAparelho(string $cofreId, string $aparelhoId): void
    {
        $plano = $this->situacao($cofreId)['plano'];
        if ($plano['max_aparelhos'] === null) {
            return;
        }
        $conhecido = $this->consultaAparelhos($cofreId)->where('aparelho_id', $aparelhoId)->exists();
        if (! $conhecido && $this->aparelhos($cofreId) >= $plano['max_aparelhos']) {
            throw new PedidoInvalido('limite_aparelhos', 'O plano chegou ao número máximo de aparelhos. Saia de um aparelho antigo para entrar neste.', 403);
        }
    }

    private function aparelhos(string $cofreId): int
    {
        return (int) $this->consultaAparelhos($cofreId)->distinct()->count('aparelho_id');
    }

    private function consultaAparelhos(string $cofreId): \Illuminate\Database\Query\Builder
    {
        return DB::table('sessoes')
            ->where('cofre_id', $cofreId)
            ->where('tipo', 'sessao')
            ->whereNull('revogada_em')
            ->where('created_at', '>=', now()->subDays((int) config('broquel.aparelhos_janela_dias')));
    }
}
