<?php

use App\Http\Controllers\InicioController;
use App\Http\Controllers\PaginaContaController;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;

// Página do Broquel. Com "Accept: application/json" (ou ?formato=json) devolve {"servico":"broquel","versao":1}.
// Sem sessão nem cookie: a visita não grava nada no banco.
Route::get('/', InicioController::class)->withoutMiddleware([
    EncryptCookies::class,
    AddQueuedCookiesToResponse::class,
    StartSession::class,
    ShareErrorsFromSession::class,
    ValidateCsrfToken::class,
]);

// Conta do SaaS e textos legais. Também sem sessão nem cookie: a página da conta guarda o token só na aba.
$semSessao = [
    EncryptCookies::class,
    AddQueuedCookiesToResponse::class,
    StartSession::class,
    ShareErrorsFromSession::class,
    ValidateCsrfToken::class,
];
Route::get('/conta', [PaginaContaController::class, 'conta'])->withoutMiddleware($semSessao);
Route::get('/termos', [PaginaContaController::class, 'termos'])->withoutMiddleware($semSessao);
Route::get('/privacidade', [PaginaContaController::class, 'privacidade'])->withoutMiddleware($semSessao);
