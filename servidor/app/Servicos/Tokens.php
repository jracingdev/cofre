<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\PedidoInvalido;

final class Tokens
{
    public function novo(): string
    {
        return sodium_bin2base64(random_bytes(32), SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
    }

    public function hash(string $token): string
    {
        try {
            $cru = sodium_base642bin($token, SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
        } catch (\SodiumException) {
            throw new PedidoInvalido('autenticacao_falhou', 'Sessão inválida.', 401);
        }
        if (strlen($cru) !== 32) {
            throw new PedidoInvalido('autenticacao_falhou', 'Sessão inválida.', 401);
        }
        $hash = sodium_crypto_generichash($cru, '', 32);
        sodium_memzero($cru);

        return bin2hex($hash);
    }

    public function codigoRecuperacao(): string
    {
        return substr(bin2hex(random_bytes(5)), 0, 10);
    }

    public function hashCodigo(string $codigo): string
    {
        $limpo = strtolower(preg_replace('/[^a-f0-9]/', '', $codigo) ?? '');
        if (strlen($limpo) !== 10) {
            throw new PedidoInvalido('autenticacao_falhou', 'Código inválido.', 401);
        }

        return bin2hex(sodium_crypto_generichash($limpo, '', 32));
    }
}
