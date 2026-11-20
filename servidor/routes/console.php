<?php

use App\Servicos\Admin;
use App\Servicos\Convites;
use App\Servicos\Exclusao;
use App\Servicos\Planos;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

// Administração do SaaS. Nada aqui lê conteúdo de cofre: só contagens e planos.

Artisan::command('broquel:convite {--plano=completo} {--usos=1} {--dias=30} {--obs=}', function (Convites $convites) {
    $dias = (int) $this->option('dias');
    $codigo = $convites->criar(
        (string) $this->option('plano'),
        (int) $this->option('usos'),
        $dias > 0 ? $dias : null,
        $this->option('obs') ?: null,
    );
    $this->info('Convite: '.$codigo);
    $this->line('Guarde agora: o código não fica salvo em claro no servidor.');
})->purpose('Cria um código de convite para criar cofre');

Artisan::command('broquel:planos', function () {
    $this->table(['id', 'nome', 'itens', 'bytes', 'aparelhos', 'público'], DB::table('planos')->get()->map(fn ($p) => [
        $p->id, $p->nome, $p->max_itens ?? '∞', $p->max_bytes ?? '∞', $p->max_aparelhos ?? '∞', $p->publico ? 'sim' : 'não',
    ])->all());
})->purpose('Lista os planos');

Artisan::command('broquel:cofres', function (Planos $planos) {
    $linhas = DB::table('cofres')->orderBy('created_at')->pluck('id')->map(function ($id) use ($planos) {
        $s = $planos->situacao($id);
        $u = $planos->uso($id);
        $conta = DB::table('conta_cofres')->join('contas', 'contas.id', '=', 'conta_cofres.conta_id')
            ->where('conta_cofres.cofre_id', $id)->value('contas.email');

        return [$id, $conta ?? '-', $s['plano']['id'], $s['valido_ate'] ?? '-', $s['somente_leitura'] ? 'sim' : 'não', $u['itens'], $u['bytes'], $u['aparelhos']];
    });
    $this->table(['cofre', 'conta', 'plano', 'válido até', 'só leitura', 'itens', 'bytes', 'aparelhos'], $linhas->all());
})->purpose('Lista cofres com plano e uso');

Artisan::command('broquel:plano {cofre} {plano} {--ate=}', function (Planos $planos) {
    $ate = $this->option('ate') ? Carbon::parse((string) $this->option('ate'))->endOfDay() : null;
    $planos->definir(strtolower((string) $this->argument('cofre')), (string) $this->argument('plano'), $ate);
    $this->info('Plano definido.');
})->purpose('Muda o plano de um cofre');

Artisan::command('broquel:bloquear {cofre} {--desbloquear}', function (Planos $planos) {
    $planos->bloquear(strtolower((string) $this->argument('cofre')), ! $this->option('desbloquear'));
    $this->info($this->option('desbloquear') ? 'Cofre desbloqueado.' : 'Cofre em somente leitura.');
})->purpose('Põe ou tira um cofre de somente leitura');

Artisan::command('broquel:excluir-contas', function (Exclusao $exclusao) {
    $this->info('Contas apagadas: '.$exclusao->apagarVencidas());
})->purpose('Apaga contas cujo prazo de exclusão já passou');

Artisan::command('broquel:admin', function (Admin $admin) {
    $this->info($admin->novoLink());
    $this->line('Abra no navegador em até '.Admin::LINK_MINUTOS.' minutos. O link vale uma vez; a sessão dura '.Admin::SESSAO_MINUTOS.' minutos.');
})->purpose('Gera o link de entrada no painel /admin');

Schedule::command('broquel:excluir-contas')->hourly();
