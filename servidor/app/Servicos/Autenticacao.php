<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\PedidoInvalido;
use App\Models\CofreRegistro;
use App\Models\SessaoAparelho;
use Broquel\Cripto\Cofre;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class Autenticacao
{
    public function __construct(
        private readonly Auditor $auditor,
        private readonly Tokens $tokens,
        private readonly Fatores $fatores,
        private readonly Planos $planos,
    ) {
    }

    /** @return array{desafio_id: string, desafio: string, expira_em: string} */
    public function desafio(CofreRegistro $cofre, Request $pedido): array
    {
        DB::table('desafios')->where('cofre_id', $cofre->id)->where('expira_em', '<', now())->delete();
        $cru = random_bytes(32);
        $id = (string) Str::uuid();
        $expira = now()->addSeconds((int) config('broquel.desafio_segundos'));
        DB::table('desafios')->insert([
            'id' => $id,
            'cofre_id' => $cofre->id,
            'desafio_hex' => bin2hex($cru),
            'expira_em' => $expira,
            'usado_em' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->auditor->registrar($cofre->id, 'auth.desafio', 'ok', $pedido);

        return [
            'desafio_id' => $id,
            'desafio' => base64_encode($cru),
            'expira_em' => $expira->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function responder(string $desafioId, string $assinaturaB64, string $aparelhoId, ?string $nome, Request $pedido): array
    {
        $assinatura = base64_decode($assinaturaB64, true);
        if ($assinatura === false || strlen($assinatura) !== 64) {
            throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível autenticar.', 401);
        }

        $resultado = DB::transaction(function () use ($desafioId, $assinatura, $aparelhoId, $nome, $pedido) {
            $linha = DB::table('desafios')->where('id', $desafioId)->lockForUpdate()->first();
            $expirado = $linha !== null && now()->greaterThan(Carbon::parse($linha->expira_em));
            if ($linha === null || $linha->usado_em !== null || $expirado) {
                $this->auditor->registrar($linha?->cofre_id, 'auth.falha', 'desafio', $pedido, $aparelhoId);
                throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível autenticar.', 401);
            }
            $cofre = CofreRegistro::query()->find($linha->cofre_id);
            if ($cofre === null) {
                throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível autenticar.', 401);
            }
            $ok = Cofre::verificar(
                hex2bin($cofre->chave_publica),
                hex2bin($cofre->id),
                hex2bin($linha->desafio_hex),
                $assinatura,
            );
            DB::table('desafios')->where('id', $desafioId)->update([
                'usado_em' => now(),
                'updated_at' => now(),
            ]);
            if (! $ok) {
                $this->auditor->registrar($cofre->id, 'auth.falha', 'assinatura', $pedido, $aparelhoId);
                throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível autenticar.', 401);
            }
            try {
                $this->planos->exigirAparelho($cofre->id, $aparelhoId);
            } catch (PedidoInvalido $erro) {
                // O desafio já ficou marcado como usado; a recusa sai depois do commit.
                $this->auditor->registrar($cofre->id, 'auth.recusado', 'aparelhos', $pedido, $aparelhoId);

                return ['__recusa' => $erro];
            }
            $metodos = $this->fatores->metodos($cofre->id);
            $tipo = $metodos === [] ? 'sessao' : 'pre';
            $emitida = $this->emitir($cofre->id, $aparelhoId, $nome, $tipo, $pedido);
            $this->auditor->registrar($cofre->id, $tipo === 'sessao' ? 'auth.ok' : 'auth.pre', 'ok', $pedido, $aparelhoId);
            if ($tipo === 'pre') {
                return [
                    'estado' => 'segundo_fator',
                    'pre_token' => $emitida['token'],
                    'sessao_id' => $emitida['id'],
                    'expira_em' => $emitida['expira_em'],
                    'metodos' => $metodos,
                ];
            }

            return [
                'estado' => 'sessao',
                'token' => $emitida['token'],
                'sessao_id' => $emitida['id'],
                'expira_em' => $emitida['expira_em'],
                'segundo_fator' => false,
            ];
        });
        if (isset($resultado['__recusa'])) {
            throw $resultado['__recusa'];
        }

        return $resultado;
    }

    /** @return array{id: string, token: string, expira_em: string} */
    public function promover(SessaoAparelho $pre, Request $pedido): array
    {
        if ($pre->tipo !== 'pre' || ! $pre->vigente()) {
            throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível autenticar.', 401);
        }
        $pre->revogada_em = now();
        $pre->save();
        $emitida = $this->emitir($pre->cofre_id, $pre->aparelho_id, $pre->nome, 'sessao', $pedido);
        $this->auditor->registrar($pre->cofre_id, 'auth.ok', 'ok', $pedido, $pre->aparelho_id);

        return [
            'estado' => 'sessao',
            'token' => $emitida['token'],
            'sessao_id' => $emitida['id'],
            'expira_em' => $emitida['expira_em'],
            'segundo_fator' => true,
        ];
    }

    public function revogar(CofreRegistro $cofre, string $sessaoId, Request $pedido): void
    {
        $sessao = SessaoAparelho::query()
            ->where('cofre_id', $cofre->id)
            ->whereKey($sessaoId)
            ->first();
        if ($sessao === null) {
            throw new PedidoInvalido('formato_invalido', 'Sessão não encontrada.', 404);
        }
        if ($sessao->revogada_em === null) {
            $sessao->revogada_em = now();
            $sessao->save();
        }
        $this->auditor->registrar($cofre->id, 'sessao.revogada', 'ok', $pedido, $sessao->aparelho_id);
    }

    /** Encerra todas as sessões deste aparelho, inclusive a que fez o pedido. */
    public function sair(CofreRegistro $cofre, SessaoAparelho $atual, Request $pedido): void
    {
        $agora = now();
        SessaoAparelho::query()
            ->where('cofre_id', $cofre->id)
            ->where('aparelho_id', $atual->aparelho_id)
            ->whereNull('revogada_em')
            ->update([
                'revogada_em' => $agora,
                'updated_at' => $agora,
            ]);
        $this->auditor->registrar($cofre->id, 'auth.sair', 'ok', $pedido, $atual->aparelho_id);
    }

    /** @return list<array<string, mixed>> */
    public function listar(CofreRegistro $cofre): array
    {
        return SessaoAparelho::query()
            ->where('cofre_id', $cofre->id)
            ->where('tipo', 'sessao')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (SessaoAparelho $sessao) => [
                'id' => $sessao->id,
                'aparelho_id' => $sessao->aparelho_id,
                'nome' => $sessao->nome,
                'expira_em' => $sessao->expira_em->toIso8601String(),
                'revogada' => $sessao->revogada_em !== null,
                'ip' => $sessao->ip,
            ])
            ->all();
    }

    /** @return array{id: string, token: string, expira_em: string} */
    private function emitir(string $cofreId, string $aparelhoId, ?string $nome, string $tipo, Request $pedido): array
    {
        $token = $this->tokens->novo();
        $id = (string) Str::uuid();
        $minutos = $tipo === 'pre' ? (int) config('broquel.pre_minutos') : (int) config('broquel.sessao_minutos');
        $expira = now()->addMinutes($minutos);
        SessaoAparelho::query()->create([
            'id' => $id,
            'cofre_id' => $cofreId,
            'aparelho_id' => $aparelhoId,
            'nome' => $nome,
            'token_hash' => $this->tokens->hash($token),
            'tipo' => $tipo,
            'expira_em' => $expira,
            'revogada_em' => null,
            'ip' => substr((string) $pedido->ip(), 0, 45),
        ]);

        return ['id' => $id, 'token' => $token, 'expira_em' => $expira->toIso8601String()];
    }
}
