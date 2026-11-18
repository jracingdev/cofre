<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Último passo TOTP aceito. Impede que o mesmo código seja usado duas vezes. */
    public function up(): void
    {
        Schema::table('totps', function (Blueprint $table) {
            $table->unsignedBigInteger('ultimo_passo')->nullable()->after('confirmado_em');
        });
    }

    public function down(): void
    {
        Schema::table('totps', function (Blueprint $table) {
            $table->dropColumn('ultimo_passo');
        });
    }
};
