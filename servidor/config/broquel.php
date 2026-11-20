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

    // SaaS. Veja docs/SAAS.md.
    // aberto: qualquer um cria cofre; convite: só com código de convite; fechado: ninguém cria.
    'cadastro' => in_array(env('BROQUEL_CADASTRO', 'convite'), ['aberto', 'convite', 'fechado'], true)
        ? (string) env('BROQUEL_CADASTRO', 'convite')
        : 'fechado',
    'max_cofres' => max(0, (int) env('BROQUEL_MAX_COFRES', 0)),
    // Plano de quem já existia antes da camada SaaS e não tem linha em cofre_planos.
    'plano_sem_registro' => (string) env('BROQUEL_PLANO_SEM_REGISTRO', 'ilimitado'),
    // Plano de quem se cadastra com o cadastro aberto.
    'plano_cadastro_aberto' => (string) env('BROQUEL_PLANO_ABERTO', 'gratis'),
    // Dias depois do vencimento em que o cofre ainda grava, antes de virar somente leitura.
    'carencia_dias' => max(0, (int) env('BROQUEL_CARENCIA_DIAS', 7)),
    // Janela para contar aparelhos de um cofre.
    'aparelhos_janela_dias' => 30,
    'conta_link_minutos' => 30,
    'conta_sessao_minutos' => 30,
    'conta_exclusao_dias' => 7,
    'termos_versao' => (string) env('BROQUEL_TERMOS_VERSAO', '2026-11-20'),
    // Quem responde pelo serviço nos termos e na política de privacidade (LGPD).
    'responsavel' => (string) env('BROQUEL_RESPONSAVEL', 'jracing.dev.br'),
    'contato' => (string) env('BROQUEL_CONTATO', 'privacidade@jracing.dev.br'),
    'cobranca_segredo' => (string) env('BROQUEL_COBRANCA_SEGREDO', ''),
];
