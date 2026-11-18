<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CofreController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\SegurancaController;
use Illuminate\Support\Facades\Route;

Route::post('/cofre', [CofreController::class, 'criar'])->middleware('throttle:auth');
Route::get('/cofre/{id}', [CofreController::class, 'mostrar'])->middleware('throttle:auth');

Route::post('/auth/desafio', [AuthController::class, 'desafio'])->middleware('throttle:auth');
Route::post('/auth/responder', [AuthController::class, 'responder'])->middleware('throttle:auth');

Route::middleware('token:pre')->group(function () {
    Route::post('/auth/totp', [AuthController::class, 'totp'])->middleware('throttle:auth');
    Route::post('/auth/recuperacao', [AuthController::class, 'recuperacao'])->middleware('throttle:auth');
    Route::post('/webauthn/login/opcoes', [SegurancaController::class, 'opcoesLogin']);
    Route::post('/webauthn/login', [SegurancaController::class, 'confirmarLogin'])->middleware('throttle:auth');
});

Route::middleware('token:sessao')->group(function () {
    Route::put('/cofre', [CofreController::class, 'atualizar']);
    Route::put('/cofre/rede', [CofreController::class, 'rede']);
    Route::get('/itens', [ItemController::class, 'index']);
    Route::put('/itens/{id}', [ItemController::class, 'gravar']);
    Route::get('/sessoes', [AuthController::class, 'sessoes']);
    Route::delete('/sessoes/{id}', [AuthController::class, 'revogar']);
    Route::post('/auth/sair', [AuthController::class, 'sair']);
    Route::post('/totp/iniciar', [SegurancaController::class, 'iniciarTotp']);
    Route::post('/totp/confirmar', [SegurancaController::class, 'confirmarTotp'])->middleware('throttle:auth');
    Route::delete('/totp', [SegurancaController::class, 'desligarTotp'])->middleware('throttle:auth');
    Route::post('/webauthn/registro/opcoes', [SegurancaController::class, 'opcoesRegistro']);
    Route::post('/webauthn/registro', [SegurancaController::class, 'confirmarRegistro'])->middleware('throttle:auth');
});
