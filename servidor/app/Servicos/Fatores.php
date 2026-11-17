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
        $totp = TOTP::create();
        $totp->setLabel('Broquel');
        $totp->setIssuer('Broquel');
        DB::table('totps')->updateOrInsert(
            ['cofre_id' => $cofre->id],
            [
                'segredo_cifrado' => encrypt($totp->getSecret()),
                'confirmado_em' => null,
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
        if ($linha === null || ! $this->codigoConfere(decrypt($linha->segredo_cifrado), $codigo)) {
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

        return $this->codigoConfere(decrypt($linha->segredo_cifrado), $codigo);
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

    private function codigoConfere(string $segredo, string $codigo): bool
    {
        if (! preg_match('/^[0-9]{6}$/', $codigo)) {
            return false;
        }
        $totp = TOTP::create($segredo);

        return $totp->verify($codigo, null, 29);
    }
}
