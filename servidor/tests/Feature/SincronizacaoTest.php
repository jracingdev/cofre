<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\ItemCofre;
use Broquel\Cripto\Cofre;
use Broquel\Cripto\Sessao;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class SincronizacaoTest extends TestCase
{
    use RefreshDatabase;

    public function test_registra_autentica_grava_e_pagina_incluindo_tombstone(): void
    {
        [$id, $token, $cripto] = $this->entrar();
        $primeiro = $this->item($cripto, 1, false, 'segredo-um');
        $segundo = $this->item($cripto, 1, false, 'segredo-dois');
        $this->comToken($token)->putJson('/v1/itens/'.$primeiro['id'], [
            'revisao_base' => 0,
            'blob' => $primeiro['blob'],
        ])->assertCreated()->assertJsonPath('revisao', 1)->assertJsonPath('apagado', false);

        $this->comToken($token)->putJson('/v1/itens/'.$segundo['id'], [
            'revisao_base' => 0,
            'blob' => $segundo['blob'],
        ])->assertCreated();

        $apagado = $this->item($cripto, 2, true, '', $primeiro['bruto']);
        $this->comToken($token)->putJson('/v1/itens/'.$primeiro['id'], [
            'revisao_base' => 1,
            'blob' => $apagado['blob'],
        ])->assertOk()->assertJsonPath('apagado', true);

        $pagina = $this->comToken($token)->getJson('/v1/itens?cursor=0&limite=1')->assertOk()->json();
        $this->assertCount(1, $pagina['itens']);
        $this->assertTrue($pagina['tem_mais']);
        $resto = $this->comToken($token)->getJson('/v1/itens?cursor='.$pagina['proximo_cursor'].'&limite=10')->assertOk()->json();
        $this->assertFalse($resto['tem_mais']);
        $todos = array_merge($pagina['itens'], $resto['itens']);
        $marcas = array_column($todos, 'apagado');
        $this->assertContains(true, $marcas);
        $this->assertNotSame($token, DB::table('sessoes')->value('token_hash'));
        $this->assertSame($id, $this->getJson('/v1/cofre/'.$id)->assertOk()->json('cofre_id'));
        $this->assertStringNotContainsString($primeiro['blob'], DB::table('auditorias')->pluck('acao')->implode(' '));
    }

    public function test_recusa_escrita_em_revisao_antiga_e_devolve_a_cabeca(): void
    {
        [, $token, $cripto] = $this->entrar();
        $item = $this->item($cripto, 1, false, 'original');
        $this->comToken($token)->putJson('/v1/itens/'.$item['id'], [
            'revisao_base' => 0,
            'blob' => $item['blob'],
        ])->assertCreated();
        $novo = $this->item($cripto, 2, false, 'novo', $item['bruto']);
        $this->comToken($token)->putJson('/v1/itens/'.$item['id'], [
            'revisao_base' => 1,
            'blob' => $novo['blob'],
        ])->assertOk();
        $atrasado = $this->item($cripto, 2, false, 'atrasado', $item['bruto']);
        $conflito = $this->comToken($token)->putJson('/v1/itens/'.$item['id'], [
            'revisao_base' => 1,
            'blob' => $atrasado['blob'],
        ]);
        $conflito->assertStatus(409)->assertJsonPath('erro', 'conflito')->assertJsonPath('item.revisao', 2);
        $this->assertSame(2, ItemCofre::query()->first()->revisao);
        $this->assertNotSame($atrasado['blob'], $conflito->json('item.blob'));
    }

    public function test_adulteracao_de_blob_e_assinatura_falham(): void
    {
        [$id, $token, $cripto] = $this->entrar();
        $item = $this->item($cripto, 1, false, 'nao-pode');
        $cru = base64_decode($item['blob'], true);
        $cru[0] = 'X';
        $this->comToken($token)->putJson('/v1/itens/'.$item['id'], [
            'revisao_base' => 0,
            'blob' => base64_encode($cru),
        ])->assertStatus(422)->assertJsonPath('erro', 'formato_invalido');

        $desafio = $this->postJson('/v1/auth/desafio', ['cofre_id' => $id])->assertOk()->json();
        $assinatura = base64_encode($cripto->assinarDesafio(base64_decode($desafio['desafio'], true)));
        $this->postJson('/v1/auth/responder', [
            'desafio_id' => $desafio['desafio_id'],
            'assinatura' => $assinatura,
            'aparelho_id' => bin2hex(random_bytes(16)),
        ])->assertOk();
        $this->postJson('/v1/auth/responder', [
            'desafio_id' => $desafio['desafio_id'],
            'assinatura' => $assinatura,
            'aparelho_id' => bin2hex(random_bytes(16)),
        ])->assertStatus(401);

        $outro = $this->postJson('/v1/auth/desafio', ['cofre_id' => $id])->json();
        $ruim = base64_decode($assinatura, true);
        $ruim[0] = chr(ord($ruim[0]) ^ 1);
        $this->postJson('/v1/auth/responder', [
            'desafio_id' => $outro['desafio_id'],
            'assinatura' => base64_encode($ruim),
            'aparelho_id' => bin2hex(random_bytes(16)),
        ])->assertStatus(401);
    }

    public function test_limite_de_tentativas_na_autenticacao(): void
    {
        config(['broquel.limite_auth' => 2]);
        $id = str_repeat('ab', 16);
        $this->postJson('/v1/auth/desafio', ['cofre_id' => $id])->assertStatus(401);
        $this->postJson('/v1/auth/desafio', ['cofre_id' => $id])->assertStatus(401);
        $this->postJson('/v1/auth/desafio', ['cofre_id' => $id])->assertStatus(429);
    }

    public function test_token_de_um_cofre_nao_le_nem_grava_o_outro(): void
    {
        [, $tokenA] = $this->entrar();
        [, $tokenB, $criptoB] = $this->entrar();
        $item = $this->item($criptoB, 1, false, 'segredo-do-outro');
        $this->comToken($tokenB)->putJson('/v1/itens/'.$item['id'], [
            'revisao_base' => 0,
            'blob' => $item['blob'],
        ])->assertCreated();

        $this->comToken($tokenA)->getJson('/v1/itens')->assertOk()->assertJsonCount(0, 'itens');
        $this->comToken($tokenA)->putJson('/v1/itens/'.$item['id'], [
            'revisao_base' => 0,
            'blob' => $item['blob'],
        ])->assertStatus(422)->assertJsonPath('erro', 'formato_invalido');

        $sessaoB = $this->comToken($tokenB)->getJson('/v1/sessoes')->assertOk()->json('sessoes.0.id');
        $this->comToken($tokenA)->deleteJson('/v1/sessoes/'.$sessaoB)->assertStatus(404);
        $this->comToken($tokenB)->getJson('/v1/itens')->assertOk()->assertJsonCount(1, 'itens');
    }

    public function test_a_api_de_sincronizacao_tem_limite(): void
    {
        [, $token] = $this->entrar();
        config(['broquel.limite_api' => 1]);
        $pedido = ['REMOTE_ADDR' => '203.0.113.77'];
        $this->withServerVariables($pedido)->comToken($token)->getJson('/v1/itens')->assertOk();
        $this->withServerVariables($pedido)->comToken($token)->getJson('/v1/itens')->assertStatus(429);
    }

    public function test_sair_revoga_o_token_deste_aparelho(): void
    {
        [, $token] = $this->entrar();
        $this->comToken($token)->getJson('/v1/itens')->assertOk();
        $this->comToken($token)->postJson('/v1/auth/sair')->assertOk()->assertJsonPath('ok', true);
        $this->comToken($token)->getJson('/v1/itens')->assertStatus(401);
        $this->comToken($token)->postJson('/v1/auth/sair')->assertStatus(401);
    }

    public function test_sessao_revogada_e_rede_restrita(): void
    {
        [, $token] = $this->entrar();
        $lista = $this->comToken($token)->getJson('/v1/sessoes')->assertOk()->json('sessoes');
        $this->comToken($token)->deleteJson('/v1/sessoes/'.$lista[0]['id'])->assertOk();
        $this->comToken($token)->getJson('/v1/itens')->assertStatus(401);

        [, $outro] = $this->entrar();
        $this->comToken($outro)->putJson('/v1/cofre/rede', [
            'restringir' => true,
            'ips' => ['203.0.113.9'],
        ])->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.4'])
            ->comToken($outro)
            ->getJson('/v1/itens')
            ->assertStatus(403)
            ->assertJsonPath('erro', 'ip_negado');
    }

    public function test_segundo_fator_totp_webauthn_e_cabecalhos(): void
    {
        [$id, $token, $cripto] = $this->entrar();
        $inicio = $this->comToken($token)->postJson('/v1/totp/iniciar')->assertOk()->json();
        $codigo = \OTPHP\TOTP::create($inicio['segredo'])->now();
        $recuperacao = $this->comToken($token)->postJson('/v1/totp/confirmar', ['codigo' => $codigo])
            ->assertOk()
            ->json('codigos_recuperacao');
        $this->assertCount(8, $recuperacao);
        $this->assertStringNotContainsString($inicio['segredo'], DB::table('auditorias')->pluck('acao')->implode(' '));
        $this->assertStringNotContainsString($inicio['segredo'], (string) DB::table('totps')->value('segredo_cifrado'));

        $opcoes = $this->comToken($token)->postJson('/v1/webauthn/registro/opcoes')->assertOk()->json();
        $this->assertArrayHasKey('challenge', $opcoes['opcoes']);
        $this->comToken($token)->postJson('/v1/webauthn/registro', [
            'desafio_id' => $opcoes['desafio_id'],
            'credencial' => ['id' => 'lixo', 'rawId' => 'lixo', 'type' => 'public-key', 'response' => []],
        ])->assertStatus(401);

        $pre = $this->preToken($id, $cripto);
        $this->assertSame('segundo_fator', $pre['estado']);
        $this->assertContains('totp', $pre['metodos']);
        $this->withToken($pre['pre_token'])->postJson('/v1/auth/totp', ['codigo' => $codigo])
            ->assertOk()
            ->assertJsonPath('estado', 'sessao');

        $preCodigo = $this->preToken($id, $cripto);
        $this->withToken($preCodigo['pre_token'])->postJson('/v1/auth/recuperacao', ['codigo' => $recuperacao[0]])
            ->assertOk();
        $deNovo = $this->preToken($id, $cripto);
        $this->withToken($deNovo['pre_token'])->postJson('/v1/auth/recuperacao', ['codigo' => $recuperacao[0]])
            ->assertStatus(401);

        $resposta = $this->getJson('/v1/cofre/'.$id)->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('no-store', (string) $resposta->headers->get('Cache-Control'));
        $this->assertSame('DENY', $resposta->headers->get('X-Frame-Options'));
    }

    /** @return array{0: string, 1: string, 2: Sessao} */
    private function entrar(): array
    {
        $cripto = Cofre::criar('correta-cavalo-bateria-broquel', ['opslimit' => 2, 'memlimit' => 8192], true);
        $id = bin2hex($cripto['sessao']->cofreId());
        $this->postJson('/v1/cofre', [
            'cabecalho' => base64_encode($cripto['cabecalho']),
        ])->assertCreated();
        $token = $this->preToken($id, $cripto['sessao']);
        $this->assertSame('sessao', $token['estado']);

        return [$id, $token['token'], $cripto['sessao']];
    }

    /** @return array<string, mixed> */
    private function preToken(string $id, Sessao $cripto): array
    {
        $desafio = $this->postJson('/v1/auth/desafio', ['cofre_id' => $id])->assertOk()->json();
        $assinatura = $cripto->assinarDesafio(base64_decode($desafio['desafio'], true));

        return $this->postJson('/v1/auth/responder', [
            'desafio_id' => $desafio['desafio_id'],
            'assinatura' => base64_encode($assinatura),
            'aparelho_id' => bin2hex(random_bytes(16)),
            'nome' => 'teste',
        ])->assertOk()->json();
    }

    /**
     * @return array{id: string, blob: string, bruto: string}
     */
    private function item(Sessao $cripto, int $revisao, bool $apagado, string $conteudo, ?string $itemId = null): array
    {
        $bruto = $itemId ?? random_bytes(16);
        $blob = $cripto->cifrarItem([
            'cofreId' => $cripto->cofreId(),
            'itemId' => $bruto,
            'revisao' => $revisao,
            'criadoEm' => 1_700_000_000_000,
            'atualizadoEm' => 1_700_000_000_000 + $revisao,
            'apagado' => $apagado,
        ], $conteudo);

        return [
            'id' => bin2hex($bruto),
            'blob' => base64_encode($blob),
            'bruto' => $bruto,
        ];
    }

    private function comToken(string $token): self
    {
        return $this->withToken($token);
    }
}
