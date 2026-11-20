<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Http\Controllers\InicioController;
use App\Servicos\Downloads;
use Tests\TestCase;

final class PaginaInicialTest extends TestCase
{
    public function test_quem_pede_json_continua_recebendo_o_json_de_sempre(): void
    {
        $this->getJson('/')->assertOk()->assertExactJson(['servico' => 'broquel', 'versao' => 1]);
        $this->get('/?formato=json')->assertOk()->assertExactJson(['servico' => 'broquel', 'versao' => 1]);
    }

    public function test_o_navegador_recebe_a_pagina_com_csp_estrita(): void
    {
        $resposta = $this->get('/', ['Accept' => 'text/html'])->assertOk();
        $resposta->assertSee('Suas senhas.', false);
        $resposta->assertSee('href="/app/"', false);
        $resposta->assertSee('id="downloads"', false);
        $resposta->assertSee('jracing.dev.br', false);

        $csp = (string) $resposta->headers->get('Content-Security-Policy');
        $this->assertSame(InicioController::POLITICA, $csp);
        $this->assertStringContainsString("default-src 'none'", $csp);
        $this->assertStringContainsString("script-src 'self'", $csp);
        $this->assertStringNotContainsString('unsafe', $csp);
        $this->assertStringNotContainsString('http', $csp);
        $this->assertSame('DENY', $resposta->headers->get('X-Frame-Options'));
        $this->assertSame('nosniff', $resposta->headers->get('X-Content-Type-Options'));
        $this->assertSame([], $resposta->headers->getCookies(), 'A página não deve criar sessão nem cookie.');

        $html = (string) $resposta->getContent();
        $this->assertStringNotContainsString('<style', $html);
        $this->assertStringNotContainsString(' style=', $html);
        $this->assertStringNotContainsString('onclick', $html);
        $this->assertDoesNotMatchRegularExpression('/<script(?![^>]*\ssrc="\/site\/)/', $html);
        $this->assertDoesNotMatchRegularExpression('/(src|href)="\/\/|src="http/', $html);
        $this->assertMatchesRegularExpression('/integrity="sha384-[A-Za-z0-9+\/=]+"/', $html);
    }

    public function test_a_api_continua_com_a_politica_mais_fechada(): void
    {
        $resposta = $this->getJson('/');
        $this->assertSame("default-src 'none'; frame-ancestors 'none'; base-uri 'none'", $resposta->headers->get('Content-Security-Policy'));
        $this->assertSame('noindex, nofollow', $resposta->headers->get('X-Robots-Tag'));
    }

    public function test_a_integridade_bate_com_os_arquivos_publicados(): void
    {
        $html = (string) $this->get('/', ['Accept' => 'text/html'])->getContent();
        foreach (['site/estilo.css', 'site/site.js'] as $arquivo) {
            $sri = 'sha384-'.base64_encode(hash_file('sha384', public_path($arquivo), true));
            $this->assertStringContainsString($sri, $html);
        }
    }

    public function test_downloads_mostram_tamanho_e_sha256_ou_em_breve(): void
    {
        $pasta = sys_get_temp_dir().'/broquel-downloads-'.bin2hex(random_bytes(4));
        mkdir($pasta);
        file_put_contents($pasta.'/broquel.apk', 'apk de teste');
        file_put_contents($pasta.'/broquel.apk.versao', "1.1.42\n");
        $this->app->instance(Downloads::class, new Downloads($pasta));

        try {
            $resposta = $this->get('/', ['Accept' => 'text/html'])->assertOk();
            $resposta->assertSee(hash('sha256', 'apk de teste'));
            $resposta->assertSee('Versão 1.1.42');
            $resposta->assertSee('href="/downloads/broquel.apk"', false);
            $resposta->assertSee('Em breve');
            $resposta->assertDontSee('href="/downloads/broquel-extensao-chrome.zip"', false);
        } finally {
            array_map('unlink', glob($pasta.'/*') ?: []);
            rmdir($pasta);
        }
    }
}
