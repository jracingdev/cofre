<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\PedidoInvalido;
use App\Models\CofreRegistro;
use Illuminate\Http\Request;

final class Rede
{
    public function __construct(private readonly Auditor $auditor)
    {
    }

    public function exigirGlobal(Request $pedido): void
    {
        $lista = config('broquel.ips');
        if (! is_array($lista) || $lista === []) {
            return;
        }
        if (! $this->contem($pedido->ip(), $lista)) {
            $this->auditor->registrar(null, 'acesso.ip', 'negado', $pedido);
            throw new PedidoInvalido('ip_negado', 'Este endereço não pode acessar o servidor.', 403);
        }
    }

    public function exigirCofre(Request $pedido, CofreRegistro $cofre): void
    {
        $this->exigirGlobal($pedido);
        if (! $cofre->restringir_ip) {
            return;
        }
        $lista = is_array($cofre->ips_permitidos) ? $cofre->ips_permitidos : [];
        if (! $this->contem($pedido->ip(), $lista)) {
            $this->auditor->registrar($cofre->id, 'acesso.ip', 'negado', $pedido);
            throw new PedidoInvalido('ip_negado', 'Este endereço não pode acessar o cofre.', 403);
        }
    }

    /** @param list<string> $lista */
    private function contem(?string $ip, array $lista): bool
    {
        if ($ip === null || $ip === '') {
            return false;
        }
        foreach ($lista as $permitido) {
            if (is_string($permitido) && strlen($permitido) === strlen($ip) && hash_equals($permitido, $ip)) {
                return true;
            }
        }

        return false;
    }
}
