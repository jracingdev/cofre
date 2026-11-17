<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class CofreWebTest extends TestCase
{
    public function test_a_pagina_publicada_tem_csp_estrita_e_integridade(): void
    {
        $html = file_get_contents(public_path('app/index.html'));
        $this->assertIsString($html);
        $this->assertStringContainsString('<title>Broquel</title>', $html);
        $this->assertStringContainsString("default-src 'none'", $html);
        $this->assertStringContainsString("script-src 'self' 'wasm-unsafe-eval'", $html);
        $this->assertStringContainsString("style-src 'self'", $html);
        $this->assertStringContainsString("connect-src 'self'", $html);
        $this->assertStringNotContainsString('unsafe-inline', $html);
        $this->assertStringNotContainsString('src="http', $html);
        $this->assertStringNotContainsString('href="http', $html);
        $this->assertMatchesRegularExpression('/integrity="sha384-[A-Za-z0-9+\/=]+"/', $html);
        $this->assertFileExists(public_path('app/escudo.svg'));
        $this->assertFileExists(public_path('app/ativos'));
    }
}
