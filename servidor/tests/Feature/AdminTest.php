<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Servicos\Admin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class AdminTest extends TestCase
{
    use RefreshDatabase;

    public function test_painel_so_entra_com_link_do_servidor_uma_vez(): void
    {
        $this->getJson('/v1/admin/resumo')->assertStatus(401);
        $this->withToken('qualquer')->getJson('/v1/admin/resumo')->assertStatus(401);

        $link = app(Admin::class)->novoLink();
        $token = substr($link, strpos($link, '#t=') + 3);
        $sessao = $this->postJson('/v1/admin/entrar', ['token' => $token])->assertOk()->json('token');
        $this->postJson('/v1/admin/entrar', ['token' => $token])->assertStatus(401);
        // O link em si não serve como sessão.
        $this->withToken($token)->getJson('/v1/admin/resumo')->assertStatus(401);

        $this->withToken($sessao)->getJson('/v1/admin/resumo')->assertOk()->assertJsonPath('cofres', 0);
        $codigo = $this->withToken($sessao)->postJson('/v1/admin/convites', ['plano_id' => 'gratis', 'usos' => 2, 'dias' => 10])
            ->assertCreated()->json('codigo');
        $this->assertMatchesRegularExpression('/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/', $codigo);
        $convites = $this->withToken($sessao)->getJson('/v1/admin/convites')->assertOk()->json('convites');
        $this->assertArrayNotHasKey('codigo_hash', $convites[0]);
        $this->withToken($sessao)->deleteJson('/v1/admin/convites/'.$convites[0]['id'])->assertOk();
        $this->assertSame(0, DB::table('convites')->whereColumn('usos', '<', 'usos_max')->count());

        $id = str_repeat('ab', 16);
        DB::table('cofres')->insert(['id' => $id, 'cabecalho_b64' => 'x', 'chave_publica' => str_repeat('0', 64), 'restringir_ip' => false, 'created_at' => now(), 'updated_at' => now()]);
        $this->withToken($sessao)->putJson('/v1/admin/cofres/'.$id.'/plano', ['plano_id' => 'completo', 'valido_ate' => '2027-01-31'])
            ->assertOk()->assertJsonPath('situacao.plano.id', 'completo');
        $this->withToken($sessao)->putJson('/v1/admin/cofres/'.$id.'/bloqueio', ['bloquear' => true])
            ->assertOk()->assertJsonPath('situacao.somente_leitura', true);
        $this->withToken($sessao)->getJson('/v1/admin/cofres')->assertOk()->assertJsonPath('cofres.0.cofre_id', $id);

        $this->withToken($sessao)->postJson('/v1/admin/sair')->assertOk();
        $this->withToken($sessao)->getJson('/v1/admin/resumo')->assertStatus(401);

        $this->travel(11)->minutes();
        $velho = app(Admin::class)->novoLink();
        $this->travel(11)->minutes();
        $this->postJson('/v1/admin/entrar', ['token' => substr($velho, strpos($velho, '#t=') + 3)])->assertStatus(401);

        $this->get('/admin')->assertOk()->assertSee('/painel/admin.js', false)->assertHeader('X-Robots-Tag', 'noindex, nofollow');
    }
}
