<?php

declare(strict_types=1);

namespace App\Excecoes;

use RuntimeException;

final class PedidoInvalido extends RuntimeException
{
    public function __construct(
        public readonly string $codigo,
        string $mensagem,
        public readonly int $status = 422,
    ) {
        parent::__construct($mensagem);
    }
}
