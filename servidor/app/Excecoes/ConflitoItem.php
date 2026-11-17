<?php

declare(strict_types=1);

namespace App\Excecoes;

use RuntimeException;

final class ConflitoItem extends RuntimeException
{
    /** @param array<string, mixed>|null $item */
    public function __construct(public readonly ?array $item)
    {
        parent::__construct('A revisão não é a cabeça atual.');
    }
}
