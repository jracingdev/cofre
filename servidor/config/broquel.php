<?php

declare(strict_types=1);

$ips = array_values(array_filter(array_map(
    'trim',
    explode(',', (string) env('BROQUEL_IPS', '')),
)));

$sessao = (int) env('BROQUEL_SESSAO_MINUTOS', 20);

return [
    // Token curto de propósito. O teto é 60 minutos.
    'sessao_minutos' => min(60, max(5, $sessao)),
    'pre_minutos' => 5,
    'desafio_segundos' => 120,
    'limite_auth' => max(1, (int) env('BROQUEL_LIMITE_AUTH', 8)),
    'limite_api' => max(10, (int) env('BROQUEL_LIMITE_API', 120)),
    'rp_id' => (string) env('BROQUEL_RP_ID', 'localhost'),
    'rp_nome' => 'Broquel',
    'origem' => (string) env('BROQUEL_ORIGEM', 'http://localhost'),
    'ips' => $ips,
    'itens_por_pagina' => 100,
    'itens_por_pagina_max' => 500,
];
