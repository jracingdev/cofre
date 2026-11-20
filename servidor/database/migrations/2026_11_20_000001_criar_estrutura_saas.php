<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Camada SaaS ao lado do cofre: planos, convites, contas e cobrança.
 * Nenhuma tabela existente muda. O formato do cofre e o cabeçalho de 357 bytes ficam como estão.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('planos', function (Blueprint $table) {
            $table->string('id', 32)->primary();
            $table->string('nome', 60);
            $table->unsignedInteger('max_itens')->nullable();
            $table->unsignedBigInteger('max_bytes')->nullable();
            $table->unsignedInteger('max_aparelhos')->nullable();
            $table->unsignedInteger('preco_centavos')->default(0);
            $table->boolean('publico')->default(false);
            $table->timestamps();
        });

        $agora = now();
        DB::table('planos')->insert([
            ['id' => 'ilimitado', 'nome' => 'Ilimitado (interno)', 'max_itens' => null, 'max_bytes' => null, 'max_aparelhos' => null, 'preco_centavos' => 0, 'publico' => false, 'created_at' => $agora, 'updated_at' => $agora],
            ['id' => 'gratis', 'nome' => 'Grátis', 'max_itens' => 50, 'max_bytes' => 5_000_000, 'max_aparelhos' => 2, 'preco_centavos' => 0, 'publico' => true, 'created_at' => $agora, 'updated_at' => $agora],
            ['id' => 'completo', 'nome' => 'Completo', 'max_itens' => null, 'max_bytes' => 200_000_000, 'max_aparelhos' => null, 'preco_centavos' => 0, 'publico' => true, 'created_at' => $agora, 'updated_at' => $agora],
        ]);

        Schema::create('cofre_planos', function (Blueprint $table) {
            $table->char('cofre_id', 32)->primary();
            $table->string('plano_id', 32);
            $table->timestamp('valido_ate')->nullable();
            $table->boolean('bloqueado')->default(false);
            $table->timestamps();
        });

        Schema::create('convites', function (Blueprint $table) {
            $table->id();
            $table->char('codigo_hash', 64)->unique();
            $table->string('plano_id', 32);
            $table->unsignedInteger('usos_max')->default(1);
            $table->unsignedInteger('usos')->default(0);
            $table->timestamp('expira_em')->nullable();
            $table->string('observacao', 80)->nullable();
            $table->timestamps();
        });

        Schema::create('contas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('email', 254)->unique();
            $table->timestamp('email_verificado_em')->nullable();
            $table->string('termos_versao', 20)->nullable();
            $table->timestamp('termos_aceitos_em')->nullable();
            $table->timestamp('excluir_em')->nullable();
            $table->timestamps();
        });

        Schema::create('conta_cofres', function (Blueprint $table) {
            $table->id();
            $table->uuid('conta_id')->index();
            $table->char('cofre_id', 32)->unique();
            $table->timestamps();
        });

        Schema::create('conta_links', function (Blueprint $table) {
            $table->id();
            $table->string('email', 254)->index();
            $table->char('token_hash', 64)->unique();
            $table->string('finalidade', 16);
            $table->char('cofre_id', 32)->nullable();
            $table->timestamp('expira_em');
            $table->timestamp('usado_em')->nullable();
            $table->timestamps();
        });

        Schema::create('conta_sessoes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('conta_id')->index();
            $table->char('token_hash', 64)->unique();
            $table->timestamp('expira_em');
            $table->timestamp('revogada_em')->nullable();
            $table->timestamps();
        });

        Schema::create('cobranca_eventos', function (Blueprint $table) {
            $table->id();
            $table->string('evento_id', 100)->unique();
            $table->string('tipo', 40);
            $table->uuid('conta_id')->nullable()->index();
            $table->string('resultado', 20);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['cobranca_eventos', 'conta_sessoes', 'conta_links', 'conta_cofres', 'contas', 'convites', 'cofre_planos', 'planos'] as $tabela) {
            Schema::dropIfExists($tabela);
        }
    }
};
