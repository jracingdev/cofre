<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Mail\LinkConta;
use App\Servicos\Convites;
use Broquel\Cripto\Cofre;
use Broquel\Cripto\Sessao;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

final class SaasTest extends TestCase
{
    use RefreshDatabase;

    public function test_cadastro_por_convite_fechado_e_aberto(): void
    {
        config(['broquel.cadastro' => 'convite']);
        $cripto = $this->novoCofre();
        $this->postJson('/v1/cofre', ['cabecalho' => $cripto['cabecalho']])
            ->assertStatus(403)->assertJsonPath('erro', 'convite_necessario');
        $this->postJson('/v1/cofre', ['cabecalho' => $cripto['cabecalho'], 'convite' => 'AAAA-BBBB-CCCC'])
            ->assertStatus(403)->assertJsonPath('erro', 'convite_invalido');

        $codigo = app(Convites::class)->criar('gratis', 1, 30, 'teste');
        $this->postJson('/v1/cofre', ['cabecalho' => $cripto['cabecalho']], ['X-Broquel-Convite' => strtolower($codigo)])
            ->assertCreated();
        $this->assertSame('gratis', DB::table('cofre_planos')->where('cofre_id', $cripto['id'])->value('plano_id'));

        $outro = $this->novoCofre();
        $this->postJson('/v1/cofre', ['cabecalho' => $outro['cabecalho'], 'convite' => $codigo])
            ->assertStatus(403)->assertJsonPath('erro', 'convite_invalido');

        config(['broquel.cadastro' => 'fechado']);
        $this->postJson('/v1/cofre', ['cabecalho' => $outro['cabecalho']])
            ->assertStatus(403)->assertJsonPath('erro', 'cadastro_fechado');

        config(['broquel.cadastro' => 'aberto', 'broquel.max_cofres' => 1]);
        $this->postJson('/v1/cofre', ['cabecalho' => $outro['cabecalho']])
            ->assertStatus(403)->assertJsonPath('erro', 'cadastro_fechado');
        config(['broquel.max_cofres' => 0, 'broquel.plano_cadastro_aberto' => 'gratis']);
        $this->postJson('/v1/cofre', ['cabecalho' => $outro['cabecalho']])->assertCreated();
        $this->assertSame('gratis', DB::table('cofre_planos')->where('cofre_id', $outro['id'])->value('plano_id'));
    }

    public function test_cofre_antigo_sem_plano_fica_ilimitado(): void
    {
        [$id, $token] = $this->entrar();
        DB::table('cofre_planos')->where('cofre_id', $id)->delete();
        $this->withToken($token)->getJson('/v1/plano')->assertOk()
            ->assertJsonPath('situacao.plano.id', 'ilimitado')
            ->assertJsonPath('situacao.somente_leitura', false)
            ->assertJsonPath('uso.itens', 0);
    }

    public function test_limite_de_itens_de_aparelhos_e_somente_leitura(): void
    {
        [$id, $token, $cripto] = $this->entrar();
        DB::table('planos')->where('id', 'gratis')->update(['max_itens' => 1, 'max_aparelhos' => 1]);
        DB::table('cofre_planos')->where('cofre_id', $id)->update(['plano_id' => 'gratis']);

        $um = $this->item($cripto, 1, false, 'um');
        $this->withToken($token)->putJson('/v1/itens/'.$um['id'], ['revisao_base' => 0, 'blob' => $um['blob']])->assertCreated();
        $dois = $this->item($cripto, 1, false, 'dois');
        $this->withToken($token)->putJson('/v1/itens/'.$dois['id'], ['revisao_base' => 0, 'blob' => $dois['blob']])
            ->assertStatus(403)->assertJsonPath('erro', 'limite_excedido');
        // Editar e apagar o que já existe continua permitido.
        $editado = $this->item($cripto, 2, false, 'um-editado', $um['bruto']);
        $this->withToken($token)->putJson('/v1/itens/'.$um['id'], ['revisao_base' => 1, 'blob' => $editado['blob']])->assertOk();

        // Segundo aparelho não entra; o mesmo aparelho entra de novo.
        $this->responder($id, $cripto, bin2hex(random_bytes(16)))->assertStatus(403)->assertJsonPath('erro', 'limite_aparelhos');
        $aparelho = DB::table('sessoes')->where('cofre_id', $id)->value('aparelho_id');
        $this->responder($id, $cripto, $aparelho)->assertOk();

        // Vencido além da carência: só leitura.
        DB::table('cofre_planos')->where('cofre_id', $id)->update(['valido_ate' => now()->subDays(8)]);
        $this->withToken($token)->getJson('/v1/itens')->assertOk();
        $tres = $this->item($cripto, 3, false, 'um-de-novo', $um['bruto']);
        $this->withToken($token)->putJson('/v1/itens/'.$um['id'], ['revisao_base' => 2, 'blob' => $tres['blob']])
            ->assertStatus(403)->assertJsonPath('erro', 'somente_leitura');
        // Dentro da carência ainda grava.
        DB::table('cofre_planos')->where('cofre_id', $id)->update(['valido_ate' => now()->subDays(2)]);
        $this->withToken($token)->putJson('/v1/itens/'.$um['id'], ['revisao_base' => 2, 'blob' => $tres['blob']])->assertOk();
    }

    public function test_conta_por_link_vincula_cofre_e_agenda_exclusao(): void
    {
        Mail::fake();
        [$id, $token, $cripto] = $this->entrar();
        $item = $this->item($cripto, 1, false, 'x');
        $this->withToken($token)->putJson('/v1/itens/'.$item['id'], ['revisao_base' => 0, 'blob' => $item['blob']])->assertCreated();

        // Conta criada pela página, sem cofre ainda.
        $this->postJson('/v1/conta/link', ['email' => 'outra@exemplo.com'])->assertStatus(202);
        $this->postJson('/v1/conta/entrar', ['token' => $this->capturarLink(), 'aceito_termos' => true])->assertOk();
        $this->postJson('/v1/conta/link', ['email' => 'invalido'])->assertStatus(422)->assertJsonPath('erro', 'email_invalido');

        $this->withToken($token)->postJson('/v1/cofre/conta', ['email' => 'Cliente@Exemplo.com'])->assertStatus(202);
        $link = $this->capturarLink();
        $this->postJson('/v1/conta/entrar', ['token' => $link])->assertStatus(422)->assertJsonPath('erro', 'termos_pendentes');
        $sessao = $this->postJson('/v1/conta/entrar', ['token' => $link, 'aceito_termos' => true])->assertOk()->json();
        $this->postJson('/v1/conta/entrar', ['token' => $link, 'aceito_termos' => true])->assertStatus(401);

        // O token da conta não abre o cofre, e o do cofre não abre a conta.
        $this->withToken($sessao['token'])->getJson('/v1/itens')->assertStatus(401);
        $this->withToken($token)->getJson('/v1/conta')->assertStatus(401);

        $this->withToken($sessao['token'])->getJson('/v1/conta')->assertOk()
            ->assertJsonPath('email', 'cliente@exemplo.com')
            ->assertJsonPath('cofres.0.cofre_id', $id)
            ->assertJsonPath('cofres.0.uso.itens', 1);

        $this->withToken($sessao['token'])->deleteJson('/v1/conta')->assertStatus(422);
        $this->withToken($sessao['token'])->deleteJson('/v1/conta', ['confirmacao' => 'EXCLUIR'])->assertOk();
        $this->withToken($sessao['token'])->postJson('/v1/conta/manter')->assertOk();
        Artisan::call('broquel:excluir-contas');
        $this->assertTrue(DB::table('cofres')->where('id', $id)->exists());

        $this->withToken($sessao['token'])->deleteJson('/v1/conta', ['confirmacao' => 'EXCLUIR'])->assertOk();
        $this->travel(8)->days();
        Artisan::call('broquel:excluir-contas');
        $this->assertFalse(DB::table('cofres')->where('id', $id)->exists());
        $this->assertSame(0, DB::table('itens')->where('cofre_id', $id)->count());
        $this->assertSame(1, DB::table('contas')->count());
    }

    public function test_link_da_pagina_no_cadastro_por_convite_so_vai_para_conta_existente(): void
    {
        Mail::fake();
        config(['broquel.cadastro' => 'convite']);
        $this->postJson('/v1/conta/link', ['email' => 'estranho@exemplo.com'])->assertStatus(202);
        Mail::assertNothingSent();
        $this->assertSame(0, DB::table('conta_links')->count());

        config(['broquel.cadastro' => 'aberto']);
        $this->postJson('/v1/conta/link', ['email' => 'dono@exemplo.com'])->assertStatus(202);
        $this->postJson('/v1/conta/entrar', ['token' => $this->capturarLink(), 'aceito_termos' => true])->assertOk();

        config(['broquel.cadastro' => 'convite']);
        $this->postJson('/v1/conta/link', ['email' => 'dono@exemplo.com'])->assertStatus(202);
        Mail::assertSent(LinkConta::class, 2);
    }

    public function test_token_malformado_e_datas_invalidas_nao_viram_erro_500(): void
    {
        $this->withToken('***nao-e-base64***')->getJson('/v1/itens')->assertStatus(401);
        $this->withToken('***nao-e-base64***')->getJson('/v1/conta')->assertStatus(401);
        $this->withToken('***nao-e-base64***')->getJson('/v1/admin/resumo')->assertStatus(401);
        config(['broquel.cobranca_segredo' => 'segredo-de-teste']);
        DB::table('contas')->insert(['id' => 'c1', 'email' => 'c1@exemplo.com', 'created_at' => now(), 'updated_at' => now()]);
        $corpo = json_encode(['evento_id' => 'e1', 'tipo' => 'pagamento_confirmado', 'conta_id' => 'c1', 'plano_id' => 'completo', 'valido_ate' => 'lixo']);
        $this->call('POST', '/v1/cobranca/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_BROQUEL_ASSINATURA' => hash_hmac('sha256', $corpo, 'segredo-de-teste'),
        ], $corpo)->assertStatus(422)->assertJsonPath('erro', 'formato_invalido');
    }

    public function test_webhook_de_cobranca_assinado_e_idempotente(): void
    {
        Mail::fake();
        [$id, $token] = $this->entrar();
        $this->postJson('/v1/cobranca/webhook', [])->assertStatus(404);
        config(['broquel.cobranca_segredo' => 'segredo-de-teste']);
        $this->withToken($token)->postJson('/v1/cofre/conta', ['email' => 'a@b.com'])->assertStatus(202);
        $conta = $this->postJson('/v1/conta/entrar', ['token' => $this->capturarLink(), 'aceito_termos' => true])->json('conta_id');

        $corpo = json_encode([
            'evento_id' => 'pg_1', 'tipo' => 'pagamento_confirmado', 'conta_id' => $conta,
            'plano_id' => 'completo', 'valido_ate' => now()->addMonth()->toIso8601String(),
        ]);
        $this->call('POST', '/v1/cobranca/webhook', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_BROQUEL_ASSINATURA' => 'errada'], $corpo)
            ->assertStatus(401);
        $assinatura = hash_hmac('sha256', $corpo, 'segredo-de-teste');
        $cabecalhos = ['CONTENT_TYPE' => 'application/json', 'HTTP_X_BROQUEL_ASSINATURA' => $assinatura];
        $this->call('POST', '/v1/cobranca/webhook', [], [], [], $cabecalhos, $corpo)->assertOk()->assertJsonPath('resultado', 'aplicado');
        $this->call('POST', '/v1/cobranca/webhook', [], [], [], $cabecalhos, $corpo)->assertOk()->assertJsonPath('resultado', 'repetido');
        $this->assertSame('completo', DB::table('cofre_planos')->where('cofre_id', $id)->value('plano_id'));
    }

    public function test_paginas_da_conta_termos_e_privacidade(): void
    {
        foreach (['/conta', '/termos', '/privacidade'] as $caminho) {
            $resposta = $this->get($caminho)->assertOk()->assertHeader('Content-Type', 'text/html; charset=UTF-8');
            $csp = (string) $resposta->headers->get('Content-Security-Policy');
            $this->assertStringContainsString("script-src 'self'", $csp);
            $this->assertStringNotContainsString('unsafe', $csp);
            $this->assertStringNotContainsString('<script>', $resposta->getContent());
            $this->assertNull($resposta->headers->get('Set-Cookie'));
        }
        $this->get('/conta')->assertSee('/painel/conta.js', false)->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        $this->get('/privacidade')->assertSee('LGPD');
    }

    /** @return array{id: string, cabecalho: string, sessao: Sessao} */
    private function novoCofre(): array
    {
        $cripto = Cofre::criar('correta-cavalo-bateria-broquel', ['opslimit' => 2, 'memlimit' => 8192], true);

        return [
            'id' => bin2hex($cripto['sessao']->cofreId()),
            'cabecalho' => base64_encode($cripto['cabecalho']),
            'sessao' => $cripto['sessao'],
        ];
    }

    /** @return array{0: string, 1: string, 2: Sessao} */
    private function entrar(): array
    {
        $cofre = $this->novoCofre();
        $this->postJson('/v1/cofre', ['cabecalho' => $cofre['cabecalho']])->assertCreated();
        $resposta = $this->responder($cofre['id'], $cofre['sessao'], bin2hex(random_bytes(16)))->assertOk()->json();

        return [$cofre['id'], $resposta['token'], $cofre['sessao']];
    }

    private function responder(string $id, Sessao $cripto, string $aparelho): \Illuminate\Testing\TestResponse
    {
        $desafio = $this->postJson('/v1/auth/desafio', ['cofre_id' => $id])->assertOk()->json();

        return $this->postJson('/v1/auth/responder', [
            'desafio_id' => $desafio['desafio_id'],
            'assinatura' => base64_encode($cripto->assinarDesafio(base64_decode($desafio['desafio'], true))),
            'aparelho_id' => $aparelho,
            'nome' => 'teste',
        ]);
    }

    private function capturarLink(): string
    {
        $enviado = Mail::sent(LinkConta::class)->last();
        $this->assertNotNull($enviado);

        return substr($enviado->url, strpos($enviado->url, '#t=') + 3);
    }

    /** @return array{id: string, blob: string, bruto: string} */
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

        return ['id' => bin2hex($bruto), 'blob' => base64_encode($blob), 'bruto' => $bruto];
    }
}
