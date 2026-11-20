<?php

declare(strict_types=1);

namespace App\Servicos;

use Illuminate\Support\Facades\DB;

/** Apaga de vez cofres e contas. Irreversível: os dados cifrados somem do servidor. */
final class Exclusao
{
    private const TABELAS_DO_COFRE = [
        'itens', 'sessoes', 'desafios', 'totps', 'codigos_recuperacao',
        'credenciais_fido', 'desafios_webauthn', 'cofre_planos', 'conta_cofres', 'auditorias',
    ];

    public function apagarCofre(string $cofreId): void
    {
        DB::transaction(function () use ($cofreId) {
            foreach (self::TABELAS_DO_COFRE as $tabela) {
                DB::table($tabela)->where('cofre_id', $cofreId)->delete();
            }
            DB::table('cofres')->where('id', $cofreId)->delete();
        });
    }

    public function apagarConta(string $contaId): void
    {
        $cofres = DB::table('conta_cofres')->where('conta_id', $contaId)->pluck('cofre_id');
        foreach ($cofres as $cofreId) {
            $this->apagarCofre((string) $cofreId);
        }
        DB::transaction(function () use ($contaId) {
            $email = DB::table('contas')->where('id', $contaId)->value('email');
            DB::table('conta_sessoes')->where('conta_id', $contaId)->delete();
            if ($email !== null) {
                DB::table('conta_links')->where('email', $email)->delete();
            }
            DB::table('contas')->where('id', $contaId)->delete();
        });
    }

    /** @return int quantas contas foram apagadas */
    public function apagarVencidas(): int
    {
        $ids = DB::table('contas')->whereNotNull('excluir_em')->where('excluir_em', '<=', now())->pluck('id');
        foreach ($ids as $id) {
            $this->apagarConta((string) $id);
        }

        return $ids->count();
    }
}
