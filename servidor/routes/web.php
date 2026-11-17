<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'servico' => 'broquel',
        'versao' => 1,
    ]);
});
