<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\PedidoInvalido;
use Illuminate\Support\Facades\DB;

/** Controla quem pode criar cofre: aberto, por convite ou fechado. */
final class Convites
{
    public function __construct(private readonly Planos $planos)
    {
    }

    /** @return string o código em claro, mostrado uma vez só */
    public function criar(string $planoId, int $usos, ?int $dias, ?string $observacao): string
    {
        $this->planos->plano($planoId);
        $codigo = implode('-', str_split(strtoupper(bin2hex(random_bytes(6))), 4));
        DB::table('convites')->insert([
            'codigo_hash' => $this->hash($codigo),
            'plano_id' => $planoId,
            'usos_max' => max(1, $usos),
            'usos' => 0,
            'expira_em' => $dias === null ? null : now()->addDays($dias),
            'observacao' => $observacao === null ? null : mb_substr($observacao, 0, 80),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $codigo;
    }

    /**
     * Verifica se pode criar um cofre agora e devolve o plano dele.
     * Deve rodar dentro da mesma transação que cria o cofre.
     */
    public function autorizarCriacao(?string $codigo): string
    {
        $maximo = (int) config('broquel.max_cofres');
        if ($maximo > 0 && DB::table('cofres')->count() >= $maximo) {
            throw new PedidoInvalido('cadastro_fechado', 'O serviço não está aceitando cofres novos agora.', 403);
        }
        $modo = (string) config('broquel.cadastro');
        if ($modo === 'fechado') {
            throw new PedidoInvalido('cadastro_fechado', 'O serviço não está aceitando cofres novos agora.', 403);
        }
        if ($modo === 'aberto' && ($codigo === null || $codigo === '')) {
            return (string) config('broquel.plano_cadastro_aberto');
        }
        if ($codigo === null || $codigo === '') {
            throw new PedidoInvalido('convite_necessario', 'Para criar um cofre agora é preciso um código de convite.', 403);
        }
        $linha = DB::table('convites')->where('codigo_hash', $this->hash($codigo))->lockForUpdate()->first();
        $esgotado = $linha === null
            || (int) $linha->usos >= (int) $linha->usos_max
            || ($linha->expira_em !== null && now()->greaterThan($linha->expira_em));
        if ($esgotado) {
            throw new PedidoInvalido('convite_invalido', 'Código de convite inválido, vencido ou já usado.', 403);
        }
        DB::table('convites')->where('id', $linha->id)->update(['usos' => (int) $linha->usos + 1, 'updated_at' => now()]);

        return (string) $linha->plano_id;
    }

    private function hash(string $codigo): string
    {
        $limpo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $codigo) ?? '');

        return hash('sha256', $limpo);
    }
}
