<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\PedidoInvalido;
use App\Models\CofreRegistro;
use Broquel\Cripto\Cofre;
use Broquel\Cripto\ErroCofre;
use Illuminate\Http\Request;

final class Cofres
{
    public function __construct(private readonly Auditor $auditor)
    {
    }

    public function registrar(string $cabecalhoB64, Request $pedido): CofreRegistro
    {
        $bytes = $this->cabecalho($cabecalhoB64);
        $lido = $this->ler($bytes);
        $id = bin2hex($lido['cofreId']);
        if (CofreRegistro::query()->whereKey($id)->exists()) {
            throw new PedidoInvalido('cofre_existente', 'Este cofre já está registrado.', 409);
        }
        $cofre = CofreRegistro::query()->create([
            'id' => $id,
            'cabecalho_b64' => base64_encode($bytes),
            'chave_publica' => bin2hex($lido['pk']),
            'restringir_ip' => false,
            'ips_permitidos' => [],
        ]);
        $this->auditor->registrar($id, 'cofre.criado', 'ok', $pedido);

        return $cofre;
    }

    public function substituir(CofreRegistro $cofre, string $cabecalhoB64, Request $pedido): CofreRegistro
    {
        $bytes = $this->cabecalho($cabecalhoB64);
        $lido = $this->ler($bytes);
        if (! hash_equals($cofre->id, bin2hex($lido['cofreId']))) {
            throw new PedidoInvalido('formato_invalido', 'O cabeçalho é de outro cofre.');
        }
        if (! hash_equals($cofre->chave_publica, bin2hex($lido['pk']))) {
            throw new PedidoInvalido('formato_invalido', 'A chave pública do cofre mudou.');
        }
        $cofre->cabecalho_b64 = base64_encode($bytes);
        $cofre->save();
        $this->auditor->registrar($cofre->id, 'cofre.atualizado', 'ok', $pedido);

        return $cofre;
    }

    public function definirRede(CofreRegistro $cofre, bool $restringir, array $ips, Request $pedido): void
    {
        $limpos = [];
        foreach ($ips as $ip) {
            if (! is_string($ip) || filter_var($ip, FILTER_VALIDATE_IP) === false) {
                throw new PedidoInvalido('formato_invalido', 'Há um endereço de rede inválido.');
            }
            $limpos[] = $ip;
        }
        if ($restringir && $limpos === []) {
            throw new PedidoInvalido('formato_invalido', 'Informe ao menos um endereço permitido.');
        }
        $cofre->restringir_ip = $restringir;
        $cofre->ips_permitidos = $limpos;
        $cofre->save();
        $this->auditor->registrar($cofre->id, 'cofre.rede', 'ok', $pedido);
    }

    private function cabecalho(string $b64): string
    {
        if (strlen($b64) > 2000) {
            throw new PedidoInvalido('formato_invalido', 'Cabeçalho grande demais.');
        }
        $bytes = base64_decode($b64, true);
        if ($bytes === false || strlen($bytes) !== Cofre::TAMANHO_CABECALHO) {
            throw new PedidoInvalido('formato_invalido', 'Cabeçalho inválido.');
        }

        return $bytes;
    }

    /** @return array{cofreId: string, pk: string} */
    private function ler(string $bytes): array
    {
        try {
            $lido = Cofre::lerCabecalho($bytes);
        } catch (ErroCofre $erro) {
            throw new PedidoInvalido($erro->codigo, 'O cabeçalho não passou na validação do formato.');
        }

        return ['cofreId' => $lido['cofreId'], 'pk' => $lido['pk']];
    }
}
