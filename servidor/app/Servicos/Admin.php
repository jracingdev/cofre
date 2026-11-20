<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\PedidoInvalido;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Painel administrativo. Só entra quem roda `php artisan broquel:admin` no servidor:
 * não há senha de admin na internet. O painel vê contagens e planos, nunca conteúdo de cofre.
 */
final class Admin
{
    public const LINK_MINUTOS = 10;

    public const SESSAO_MINUTOS = 30;

    public function __construct(
        private readonly Tokens $tokens,
        private readonly Planos $planos,
        private readonly Auditor $auditor,
    ) {
    }

    public function novoLink(): string
    {
        // Links antigos não usados deixam de valer.
        DB::table('admin_tokens')->where('tipo', 'link')->whereNull('usado_em')->delete();
        $token = $this->tokens->novo();
        DB::table('admin_tokens')->insert([
            'id' => (string) Str::uuid(),
            'token_hash' => $this->tokens->hash($token),
            'tipo' => 'link',
            'expira_em' => now()->addMinutes(self::LINK_MINUTOS),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return rtrim((string) config('app.url'), '/').'/admin#t='.$token;
    }

    /** @return array{token: string, expira_em: string} */
    public function entrar(string $token, Request $pedido): array
    {
        $hash = $this->tokens->hash($token);

        return DB::transaction(function () use ($hash, $pedido) {
            $link = DB::table('admin_tokens')->where('token_hash', $hash)->where('tipo', 'link')->lockForUpdate()->first();
            if ($link === null || $link->usado_em !== null || now()->greaterThan(Carbon::parse($link->expira_em))) {
                $this->auditor->registrar(null, 'admin.falha', 'link', $pedido);
                throw new PedidoInvalido('link_invalido', 'Link inválido ou vencido. Gere outro no servidor.', 401);
            }
            DB::table('admin_tokens')->where('id', $link->id)->update(['usado_em' => now(), 'ip' => $pedido->ip(), 'updated_at' => now()]);
            $sessao = $this->tokens->novo();
            $expira = now()->addMinutes(self::SESSAO_MINUTOS);
            DB::table('admin_tokens')->insert([
                'id' => (string) Str::uuid(),
                'token_hash' => $this->tokens->hash($sessao),
                'tipo' => 'sessao',
                'expira_em' => $expira,
                'ip' => substr((string) $pedido->ip(), 0, 45),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->auditor->registrar(null, 'admin.entrou', 'ok', $pedido);

            return ['token' => $sessao, 'expira_em' => $expira->toIso8601String()];
        });
    }

    public function sessaoValida(string $token): ?string
    {
        try {
            $hash = $this->tokens->hash($token);
        } catch (PedidoInvalido) {
            return null;
        }
        $linha = DB::table('admin_tokens')->where('token_hash', $hash)->where('tipo', 'sessao')->first();
        if ($linha === null || $linha->usado_em !== null || now()->greaterThan(Carbon::parse($linha->expira_em))) {
            return null;
        }

        return (string) $linha->id;
    }

    public function sair(string $sessaoId): void
    {
        DB::table('admin_tokens')->where('id', $sessaoId)->update(['usado_em' => now(), 'updated_at' => now()]);
    }

    /** @return array<string, mixed> */
    public function resumo(): array
    {
        return [
            'cadastro' => (string) config('broquel.cadastro'),
            'cofres' => DB::table('cofres')->count(),
            'contas' => DB::table('contas')->count(),
            'exclusoes_agendadas' => DB::table('contas')->whereNotNull('excluir_em')->count(),
            'convites_ativos' => DB::table('convites')->whereColumn('usos', '<', 'usos_max')
                ->where(fn ($q) => $q->whereNull('expira_em')->orWhere('expira_em', '>', now()))->count(),
            'planos' => DB::table('planos')->orderBy('preco_centavos')->get()->map(fn ($p) => [
                'id' => $p->id, 'nome' => $p->nome, 'max_itens' => $p->max_itens,
                'max_bytes' => $p->max_bytes, 'max_aparelhos' => $p->max_aparelhos,
            ])->all(),
        ];
    }

    /** @return list<array<string, mixed>> */
    public function cofres(): array
    {
        $emails = DB::table('conta_cofres')->join('contas', 'contas.id', '=', 'conta_cofres.conta_id')
            ->pluck('contas.email', 'conta_cofres.cofre_id');

        return DB::table('cofres')->orderByDesc('created_at')->get(['id', 'created_at'])->map(fn ($c) => [
            'cofre_id' => $c->id,
            'criado_em' => Carbon::parse($c->created_at)->toIso8601String(),
            'email' => $emails[$c->id] ?? null,
            'situacao' => $this->planos->situacao($c->id),
            'uso' => $this->planos->uso($c->id),
        ])->all();
    }

    /** @return list<array<string, mixed>> */
    public function convites(): array
    {
        return DB::table('convites')->orderByDesc('id')->limit(200)->get()->map(fn ($c) => [
            'id' => (int) $c->id,
            'plano_id' => $c->plano_id,
            'usos' => (int) $c->usos,
            'usos_max' => (int) $c->usos_max,
            'expira_em' => $c->expira_em === null ? null : Carbon::parse($c->expira_em)->toIso8601String(),
            'observacao' => $c->observacao,
            'criado_em' => Carbon::parse($c->created_at)->toIso8601String(),
        ])->all();
    }

    public function encerrarConvite(int $id): void
    {
        DB::table('convites')->where('id', $id)->update(['usos_max' => DB::raw('usos'), 'updated_at' => now()]);
    }
}
