<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\PedidoInvalido;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Recebe eventos do gateway de pagamento num formato neutro, já traduzido por um adaptador.
 * O servidor nunca recebe dados de cartão: só "a conta X pagou o plano Y até a data Z".
 */
final class Cobranca
{
    public function __construct(private readonly Planos $planos)
    {
    }

    public function assinaturaValida(string $corpo, string $assinatura): bool
    {
        $segredo = (string) config('broquel.cobranca_segredo');
        if ($segredo === '' || $assinatura === '') {
            return false;
        }

        return hash_equals(hash_hmac('sha256', $corpo, $segredo), strtolower($assinatura));
    }

    /**
     * @param array<string, mixed> $evento {evento_id, tipo, conta_id, plano_id?, valido_ate?}
     * @return string resultado: aplicado | repetido
     */
    public function aplicar(array $evento): string
    {
        $eventoId = $evento['evento_id'] ?? null;
        $tipo = $evento['tipo'] ?? null;
        $contaId = $evento['conta_id'] ?? null;
        if (! is_string($eventoId) || $eventoId === '' || strlen($eventoId) > 100 || ! is_string($tipo) || ! is_string($contaId)) {
            throw new PedidoInvalido('formato_invalido', 'Evento de cobrança incompleto.');
        }
        if (! in_array($tipo, ['pagamento_confirmado', 'assinatura_cancelada', 'pagamento_atrasado'], true)) {
            throw new PedidoInvalido('formato_invalido', 'Tipo de evento desconhecido.');
        }

        return DB::transaction(function () use ($eventoId, $tipo, $contaId, $evento) {
            if (DB::table('cobranca_eventos')->where('evento_id', $eventoId)->exists()) {
                return 'repetido';
            }
            if (! DB::table('contas')->where('id', $contaId)->exists()) {
                throw new PedidoInvalido('nao_encontrado', 'Conta não encontrada.', 404);
            }
            $cofres = DB::table('conta_cofres')->where('conta_id', $contaId)->pluck('cofre_id');
            if ($tipo === 'pagamento_confirmado') {
                $planoId = $evento['plano_id'] ?? null;
                $ate = $evento['valido_ate'] ?? null;
                if (! is_string($planoId) || ! is_string($ate)) {
                    throw new PedidoInvalido('formato_invalido', 'Pagamento sem plano ou validade.');
                }
                try {
                    $validoAte = Carbon::parse($ate);
                } catch (\Throwable) {
                    throw new PedidoInvalido('formato_invalido', 'Data de validade inválida.');
                }
                foreach ($cofres as $cofreId) {
                    $this->planos->definir((string) $cofreId, $planoId, $validoAte);
                }
            }
            // Cancelamento e atraso não cortam nada na hora: o cofre segue até valido_ate
            // e depois da carência vira somente leitura. Nunca apaga dados por falta de pagamento.
            DB::table('cobranca_eventos')->insert([
                'evento_id' => $eventoId,
                'tipo' => $tipo,
                'conta_id' => $contaId,
                'resultado' => 'aplicado',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return 'aplicado';
        });
    }
}
