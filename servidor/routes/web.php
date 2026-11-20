<?php

use App\Http\Controllers\InicioController;
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
