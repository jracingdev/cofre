<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Servicos\Downloads;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class InicioController extends Controller
{
    /** Política só da página inicial: nada inline, nada de outro site. */
    public const POLITICA = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; "
        ."base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";

    public function __invoke(Request $pedido, Downloads $downloads): Response|JsonResponse
    {
        // Quem pede JSON (monitoramento, scripts) continua recebendo a resposta de sempre.
        if ($pedido->wantsJson() || $pedido->query('formato') === 'json') {
            return response()->json(['servico' => 'broquel', 'versao' => 1]);
        }

        return response()
            ->view('inicio', [
                'downloads' => $downloads->lista(),
                'css' => self::ativo('site/estilo.css'),
                'js' => self::ativo('site/site.js'),
            ])
            ->header('Content-Security-Policy', self::POLITICA)
            ->header('X-Robots-Tag', 'index, follow')
            ->header('Vary', 'Accept');
    }

    /** @return array{url: string, integridade: string} */
    private static function ativo(string $caminho): array
    {
        $conteudo = (string) file_get_contents(public_path($caminho));

        return [
            'url' => '/'.$caminho.'?v='.substr(hash('sha256', $conteudo), 0, 12),
            'integridade' => 'sha384-'.base64_encode(hash('sha384', $conteudo, true)),
        ];
    }
}
