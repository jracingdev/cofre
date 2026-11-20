<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\Response;

/** Páginas da conta do SaaS: "Minha conta", termos de uso e política de privacidade. */
final class PaginaContaController extends Controller
{
    /** Igual à da página inicial, mas a página da conta fala com a própria API. */
    public const POLITICA = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; "
        ."base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";

    public function conta(): Response
    {
        return $this->pagina('paginas.conta', 'noindex, nofollow', true);
    }

    public function admin(): Response
    {
        return $this->pagina('paginas.admin', 'noindex, nofollow', true, 'painel/admin.js');
    }

    public function termos(): Response
    {
        return $this->pagina('paginas.termos', 'index, follow', false);
    }

    public function privacidade(): Response
    {
        return $this->pagina('paginas.privacidade', 'index, follow', false);
    }

    private function pagina(string $view, string $robots, bool $comScript, string $script = 'painel/conta.js'): Response
    {
        return response()
            ->view($view, [
                'css' => self::ativo('site/estilo.css'),
                'cssConta' => self::ativo('painel/conta.css'),
                'js' => $comScript ? self::ativo($script) : null,
                'versao' => (string) config('broquel.termos_versao'),
                'responsavel' => (string) config('broquel.responsavel'),
                'contato' => (string) config('broquel.contato'),
            ])
            ->header('Content-Security-Policy', self::POLITICA)
            ->header('X-Robots-Tag', $robots);
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
