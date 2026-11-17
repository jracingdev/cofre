<?php

declare(strict_types=1);

namespace Broquel\Cripto;

final class ErroCofre extends \RuntimeException
{
    public function __construct(public readonly string $codigo, string $mensagem)
    {
        parent::__construct($mensagem);
    }
}
