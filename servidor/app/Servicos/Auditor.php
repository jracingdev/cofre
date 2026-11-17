<?php

declare(strict_types=1);

namespace App\Servicos;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Registra o fato, nunca o conteúdo. Não recebe blob, token, senha nem código. */
final class Auditor
{
    public function registrar(
        ?string $cofreId,
        string $acao,
        string $resultado,
        Request $pedido,
        ?string $aparelhoId = null,
    ): void {
        DB::table('auditorias')->insert([
            'cofre_id' => $cofreId,
            'acao' => substr($acao, 0, 40),
            'resultado' => substr($resultado, 0, 20),
            'ip' => substr((string) $pedido->ip(), 0, 45),
            'aparelho_id' => $aparelhoId,
            'created_at' => now(),
        ]);
    }
}
