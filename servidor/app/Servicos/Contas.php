<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\PedidoInvalido;
use App\Mail\LinkConta;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Conta do cliente: e-mail, termos aceitos, cofres ligados e cobrança.
 * A conta nunca abre o cofre. Entrar no cofre continua sendo pela assinatura do desafio.
 */
final class Contas
{
    public function __construct(
        private readonly Tokens $tokens,
        private readonly Auditor $auditor,
        private readonly Planos $planos,
    ) {
    }

    public static function email(mixed $valor): string
    {
        $email = is_string($valor) ? mb_strtolower(trim($valor)) : '';
        if ($email === '' || strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new PedidoInvalido('email_invalido', 'Informe um e-mail válido.');
        }

        return $email;
    }

    /**
     * Manda o link mágico. Os dois criam a conta no primeiro uso (com aceite dos termos);
     * 'vincular' também liga o cofre da sessão à conta. A resposta é igual exista a conta ou não.
     */
    public function enviarLink(string $email, string $finalidade, ?string $cofreId, Request $pedido): void
    {
        $recentes = DB::table('conta_links')->where('email', $email)
            ->where('created_at', '>=', now()->subHour())->count();
        if ($recentes >= 5) {
            throw new PedidoInvalido('muitas_tentativas', 'Muitos links pedidos. Tente de novo mais tarde.', 429);
        }
        $token = $this->tokens->novo();
        DB::table('conta_links')->insert([
            'email' => $email,
            'token_hash' => $this->tokens->hash($token),
            'finalidade' => $finalidade,
            'cofre_id' => $cofreId,
            'expira_em' => now()->addMinutes((int) config('broquel.conta_link_minutos')),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $url = rtrim((string) config('app.url'), '/').'/conta#t='.$token;
        Mail::to($email)->send(new LinkConta($url, $finalidade, (int) config('broquel.conta_link_minutos')));
        $this->auditor->registrar($cofreId, 'conta.link', $finalidade, $pedido);
    }

    /** @return array{token: string, expira_em: string, conta_id: string} */
    public function entrar(string $token, bool $aceitouTermos, Request $pedido): array
    {
        $hash = $this->tokens->hash($token);

        return DB::transaction(function () use ($hash, $aceitouTermos, $pedido) {
            $link = DB::table('conta_links')->where('token_hash', $hash)->lockForUpdate()->first();
            if ($link === null || $link->usado_em !== null || now()->greaterThan(Carbon::parse($link->expira_em))) {
                throw new PedidoInvalido('link_invalido', 'Link inválido ou vencido. Peça outro.', 401);
            }
            $conta = DB::table('contas')->where('email', $link->email)->first();
            if ($conta === null && ! $aceitouTermos) {
                throw new PedidoInvalido('termos_pendentes', 'Para criar a conta é preciso aceitar os termos de uso e a política de privacidade.', 422);
            }
            DB::table('conta_links')->where('id', $link->id)->update(['usado_em' => now(), 'updated_at' => now()]);
            if ($conta === null) {
                $id = (string) Str::uuid();
                DB::table('contas')->insert([
                    'id' => $id,
                    'email' => $link->email,
                    'email_verificado_em' => now(),
                    'termos_versao' => (string) config('broquel.termos_versao'),
                    'termos_aceitos_em' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $this->auditor->registrar($link->cofre_id, 'conta.criada', 'ok', $pedido);
            } else {
                $id = (string) $conta->id;
                $mudancas = ['email_verificado_em' => $conta->email_verificado_em ?? now(), 'updated_at' => now()];
                if ($aceitouTermos) {
                    $mudancas['termos_versao'] = (string) config('broquel.termos_versao');
                    $mudancas['termos_aceitos_em'] = now();
                }
                DB::table('contas')->where('id', $id)->update($mudancas);
            }
            if ($link->finalidade === 'vincular' && $link->cofre_id !== null
                && DB::table('cofres')->where('id', $link->cofre_id)->exists()) {
                $dono = DB::table('conta_cofres')->where('cofre_id', $link->cofre_id)->value('conta_id');
                if ($dono !== null && $dono !== $id) {
                    throw new PedidoInvalido('cofre_ja_vinculado', 'Este cofre já está ligado a outra conta.', 409);
                }
                if ($dono === null) {
                    DB::table('conta_cofres')->insert([
                        'conta_id' => $id,
                        'cofre_id' => $link->cofre_id,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $this->auditor->registrar($link->cofre_id, 'conta.vinculada', 'ok', $pedido);
                }
            }
            $token = $this->tokens->novo();
            $expira = now()->addMinutes((int) config('broquel.conta_sessao_minutos'));
            DB::table('conta_sessoes')->insert([
                'id' => (string) Str::uuid(),
                'conta_id' => $id,
                'token_hash' => $this->tokens->hash($token),
                'expira_em' => $expira,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return ['token' => $token, 'expira_em' => $expira->toIso8601String(), 'conta_id' => $id];
        });
    }

    /** @return array<string, mixed> */
    public function resumo(string $contaId): array
    {
        $conta = DB::table('contas')->where('id', $contaId)->first();
        $cofres = DB::table('conta_cofres')->where('conta_id', $contaId)->orderBy('created_at')->pluck('cofre_id');

        return [
            'email' => $conta->email,
            'termos_versao' => $conta->termos_versao,
            'termos_atual' => (string) config('broquel.termos_versao'),
            'excluir_em' => $conta->excluir_em === null ? null : Carbon::parse($conta->excluir_em)->toIso8601String(),
            'cofres' => $cofres->map(fn (string $cofreId) => [
                'cofre_id' => $cofreId,
                'situacao' => $this->planos->situacao($cofreId),
                'uso' => $this->planos->uso($cofreId),
            ])->all(),
        ];
    }

    public function agendarExclusao(string $contaId, Request $pedido): string
    {
        $quando = now()->addDays((int) config('broquel.conta_exclusao_dias'));
        DB::table('contas')->where('id', $contaId)->update(['excluir_em' => $quando, 'updated_at' => now()]);
        $this->auditor->registrar(null, 'conta.exclusao', 'agendada', $pedido);

        return $quando->toIso8601String();
    }

    public function cancelarExclusao(string $contaId, Request $pedido): void
    {
        DB::table('contas')->where('id', $contaId)->update(['excluir_em' => null, 'updated_at' => now()]);
        $this->auditor->registrar(null, 'conta.exclusao', 'cancelada', $pedido);
    }

    public function sair(string $sessaoId): void
    {
        DB::table('conta_sessoes')->where('id', $sessaoId)->update(['revogada_em' => now(), 'updated_at' => now()]);
    }
}
