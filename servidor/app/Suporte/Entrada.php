<?php

declare(strict_types=1);

namespace App\Suporte;

use App\Excecoes\PedidoInvalido;

final class Entrada
{
    public static function hex(mixed $valor, int $bytes): string
    {
        if (! is_string($valor)) {
            throw new PedidoInvalido('formato_invalido', 'Identificador inválido.');
        }
        $valor = strtolower($valor);
        if (preg_match('/^[0-9a-f]{'.($bytes * 2).'}$/', $valor) !== 1) {
            throw new PedidoInvalido('formato_invalido', 'Identificador inválido.');
        }

        return $valor;
    }

    public static function nome(?string $nome): ?string
    {
        if ($nome === null || $nome === '') {
            return null;
        }
        $limpo = preg_replace('/[^\p{L}\p{N} .\-_]/u', '', $nome) ?? '';
        $limpo = trim($limpo);

        return $limpo === '' ? null : mb_substr($limpo, 0, 40);
    }
}
