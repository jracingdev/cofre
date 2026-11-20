<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\PedidoInvalido;
use App\Models\CofreRegistro;
use Illuminate\Support\Facades\DB;
use OTPHP\TOTP;

final class Fatores
{
    public function __construct(private readonly Tokens $tokens)
    {
    }

    /** @return list<string> */
    public function metodos(string $cofreId): array
    {
        $metodos = [];
        $totp = DB::table('totps')->where('cofre_id', $cofreId)->whereNotNull('confirmado_em')->exists();
        if ($totp) {
            $metodos[] = 'totp';
        }
        if (DB::table('credenciais_fido')->where('cofre_id', $cofreId)->exists()) {
            $metodos[] = 'webauthn';
        }
        if ($totp && DB::table('codigos_recuperacao')->where('cofre_id', $cofreId)->whereNull('usado_em')->exists()) {
            $metodos[] = 'recuperacao';
        }

        return $metodos;
    }

    /** @return array{segredo: string, uri: string} */
    public function iniciarTotp(CofreRegistro $cofre): array
    {
        // Gerar outro segredo por cima de um TOTP ativo desligaria o segundo fator sem pedir código.
        if (DB::table('totps')->where('cofre_id', $cofre->id)->whereNotNull('confirmado_em')->exists()) {
            throw new PedidoInvalido('totp_ativo', 'O TOTP já está ligado. Desligue com um código antes de gerar outro.', 409);
        }
        $totp = TOTP::create();
        $totp->setLabel('Broquel');
        $totp->setIssuer('Broquel');
        DB::table('totps')->updateOrInsert(
            ['cofre_id' => $cofre->id],
            [
                'segredo_cifrado' => encrypt($totp->getSecret()),
                'confirmado_em' => null,
                'ultimo_passo' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );

        return [
            'segredo' => $totp->getSecret(),
            'uri' => $totp->getProvisioningUri(),
        ];
    }

    /** @return list<string> */
    public function confirmarTotp(CofreRegistro $cofre, string $codigo): array
    {
        $linha = DB::table('totps')->where('cofre_id', $cofre->id)->first();
        $passo = $linha === null ? null : $this->passoDoCodigo(decrypt($linha->segredo_cifrado), $codigo);
        if ($passo === null || ! $this->gastarPasso($cofre->id, $passo)) {
            throw new PedidoInvalido('autenticacao_falhou', 'Código inválido.', 401);
        }
        DB::table('totps')->where('cofre_id', $cofre->id)->update([
            'confirmado_em' => now(),
            'updated_at' => now(),
        ]);
        DB::table('codigos_recuperacao')->where('cofre_id', $cofre->id)->delete();
        $claros = [];
        $linhas = [];
        for ($i = 0; $i < 8; $i++) {
            $codigoClaro = $this->tokens->codigoRecuperacao();
            $claros[] = $codigoClaro;
            $linhas[] = [
                'cofre_id' => $cofre->id,
                'codigo_hash' => $this->tokens->hashCodigo($codigoClaro),
                'usado_em' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }
        DB::table('codigos_recuperacao')->insert($linhas);

        return $claros;
    }

    public function totpConfere(string $cofreId, string $codigo): bool
    {
        $linha = DB::table('totps')->where('cofre_id', $cofreId)->whereNotNull('confirmado_em')->first();
        if ($linha === null) {
            return false;
        }

        $passo = $this->passoDoCodigo(decrypt($linha->segredo_cifrado), $codigo);

        return $passo !== null && $this->gastarPasso($cofreId, $passo);
    }

    public function gastarRecuperacao(string $cofreId, string $codigo): bool
    {
        try {
            $hash = $this->tokens->hashCodigo($codigo);
        } catch (PedidoInvalido) {
            return false;
        }
        $linha = DB::table('codigos_recuperacao')
            ->where('cofre_id', $cofreId)
            ->where('codigo_hash', $hash)
            ->whereNull('usado_em')
            ->first();
        if ($linha === null) {
            return false;
        }
        DB::table('codigos_recuperacao')->where('id', $linha->id)->update([
            'usado_em' => now(),
            'updated_at' => now(),
        ]);

        return true;
    }

    public function desligarTotp(CofreRegistro $cofre, string $codigo): void
    {
        if (! $this->totpConfere($cofre->id, $codigo) && ! $this->gastarRecuperacao($cofre->id, $codigo)) {
            throw new PedidoInvalido('autenticacao_falhou', 'Código inválido.', 401);
        }
        DB::table('totps')->where('cofre_id', $cofre->id)->delete();
        DB::table('codigos_recuperacao')->where('cofre_id', $cofre->id)->delete();
    }

    /**
     * Devolve o passo de 30 segundos em que o código vale, ou null.
     * Folga de 15 segundos, abaixo do passo: aceita o relógio na borda, não o passo inteiro dos dois lados.
     */
    private function passoDoCodigo(string $segredo, string $codigo): ?int
    {
        if (! preg_match('/^[0-9]{6}$/', $codigo)) {
            return null;
        }
        $totp = TOTP::create($segredo);
        $periodo = $totp->getPeriod();
        $agora = now()->getTimestamp();
        $passos = array_unique([
            intdiv($agora - 15, $periodo),
            intdiv($agora, $periodo),
            intdiv($agora + 15, $periodo),
        ]);
        $achado = null;
        foreach ($passos as $passo) {
            // Confere todos os passos, sem sair cedo, para o tempo não dizer qual bateu.
            if (hash_equals($totp->at($passo * $periodo), $codigo)) {
                $achado = $passo;
            }
        }

        return $achado;
    }

    /**
     * Marca o passo como usado. Um código já aceito, ou de um passo anterior, não vale de novo (RFC 6238, 5.2).
     * A troca é atômica: dois pedidos com o mesmo código não passam juntos.
     */
    private function gastarPasso(string $cofreId, int $passo): bool
    {
        return DB::table('totps')
            ->where('cofre_id', $cofreId)
            ->where(function ($consulta) use ($passo): void {
                $consulta->whereNull('ultimo_passo')->orWhere('ultimo_passo', '<', $passo);
            })
            ->update(['ultimo_passo' => $passo, 'updated_at' => now()]) === 1;
    }
}
