<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cofres', function (Blueprint $table) {
            $table->char('id', 32)->primary();
            $table->text('cabecalho_b64');
            $table->char('chave_publica', 64);
            $table->boolean('restringir_ip')->default(false);
            $table->json('ips_permitidos')->nullable();
            $table->timestamps();
        });

        Schema::create('desafios', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->char('cofre_id', 32)->index();
            $table->char('desafio_hex', 64);
            $table->timestamp('expira_em');
            $table->timestamp('usado_em')->nullable();
            $table->timestamps();
        });

        Schema::create('sessoes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->char('cofre_id', 32)->index();
            $table->char('aparelho_id', 32);
            $table->string('nome', 40)->nullable();
            $table->char('token_hash', 64)->unique();
            $table->string('tipo', 16);
            $table->timestamp('expira_em');
            $table->timestamp('revogada_em')->nullable();
            $table->string('ip', 45);
            $table->timestamps();
            $table->index(['cofre_id', 'aparelho_id']);
        });

        Schema::create('contadores', function (Blueprint $table) {
            $table->string('nome', 32)->primary();
            $table->unsignedBigInteger('valor');
        });

        Schema::create('itens', function (Blueprint $table) {
            $table->id();
            $table->char('cofre_id', 32);
            $table->char('item_id', 32);
            $table->unsignedInteger('revisao');
            $table->unsignedBigInteger('criado_em_ms');
            $table->unsignedBigInteger('atualizado_em_ms');
            $table->boolean('apagado');
            $table->longText('blob_b64');
            $table->unsignedBigInteger('cursor')->unique();
            $table->timestamps();
            $table->unique(['cofre_id', 'item_id']);
            $table->index(['cofre_id', 'cursor']);
        });

        Schema::create('totps', function (Blueprint $table) {
            $table->char('cofre_id', 32)->primary();
            $table->text('segredo_cifrado');
            $table->timestamp('confirmado_em')->nullable();
            $table->timestamps();
        });

        Schema::create('codigos_recuperacao', function (Blueprint $table) {
            $table->id();
            $table->char('cofre_id', 32)->index();
            $table->char('codigo_hash', 64);
            $table->timestamp('usado_em')->nullable();
            $table->timestamps();
        });

        Schema::create('credenciais_fido', function (Blueprint $table) {
            $table->id();
            $table->char('cofre_id', 32)->index();
            $table->text('credencial_id_b64');
            $table->longText('registro_json');
            $table->unsignedInteger('contador')->default(0);
            $table->timestamps();
            $table->unique(['cofre_id', 'credencial_id_b64']);
        });

        Schema::create('desafios_webauthn', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->char('cofre_id', 32)->index();
            $table->string('tipo', 16);
            $table->longText('opcoes_json');
            $table->timestamp('expira_em');
            $table->timestamps();
        });

        Schema::create('auditorias', function (Blueprint $table) {
            $table->id();
            $table->char('cofre_id', 32)->nullable()->index();
            $table->string('acao', 40);
            $table->string('resultado', 20);
            $table->string('ip', 45);
            $table->char('aparelho_id', 32)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        DB::table('contadores')->insert(['nome' => 'sync', 'valor' => 0]);
    }

    public function down(): void
    {
        Schema::dropIfExists('auditorias');
        Schema::dropIfExists('desafios_webauthn');
        Schema::dropIfExists('credenciais_fido');
        Schema::dropIfExists('codigos_recuperacao');
        Schema::dropIfExists('totps');
        Schema::dropIfExists('itens');
        Schema::dropIfExists('contadores');
        Schema::dropIfExists('sessoes');
        Schema::dropIfExists('desafios');
        Schema::dropIfExists('cofres');
    }
};
