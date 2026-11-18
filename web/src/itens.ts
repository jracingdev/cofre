import { idDoNome, zerarMemoria, type MetadadosItem, type SessaoCofre } from '@broquel/cripto';
import { deHex, paraHex } from './codec.js';
import { conteudoVazio, lerLogin, lerNome, normalizarNome, serializarLogin, serializarNome, type ConteudoLogin } from './item.js';
import type { ItemLocal } from './sincronia.js';

export async function incluirItem(
  sessao: SessaoCofre,
  itens: ItemLocal[],
  conteudo: ConteudoLogin,
  agora: bigint,
  itemId: Uint8Array,
): Promise<ItemLocal[]> {
  const meta: MetadadosItem = {
    cofreId: sessao.cofreId,
    itemId,
    revisao: 1,
    criadoEm: agora,
    atualizadoEm: agora,
    apagado: false,
  };
  const claro = serializarLogin({ ...conteudo, conflitoDe: null });
  try {
    const blob = await sessao.cifrarItem(meta, claro);
    return [...itens, itemDe(meta, blob, 0, 0)];
  } finally {
    zerarMemoria(claro);
  }
}

export async function alterarItem(
  sessao: SessaoCofre,
  itens: ItemLocal[],
  itemId: string,
  conteudo: ConteudoLogin,
  agora: bigint,
): Promise<ItemLocal[]> {
  const atual = exigir(itens, itemId);
  const aberto = await sessao.decifrarItem(atual.blob);
  let claro: Uint8Array | null = null;
  try {
    const anterior = aberto.conteudo.length === 0 ? conteudoVazio() : lerLogin(aberto.conteudo);
    claro = serializarLogin({ ...conteudo, conflitoDe: anterior.conflitoDe });
    const meta: MetadadosItem = {
      cofreId: sessao.cofreId,
      itemId: deHex(itemId),
      revisao: atual.revisao + 1,
      criadoEm: atual.criadoEm,
      atualizadoEm: agora,
      apagado: false,
    };
    const blob = await sessao.cifrarItem(meta, claro);
    return trocar(itens, itemDe(meta, blob, atual.cursor, atual.revisao));
  } finally {
    zerarMemoria(aberto.conteudo, claro);
  }
}

export async function excluirItem(sessao: SessaoCofre, itens: ItemLocal[], itemId: string, agora: bigint): Promise<ItemLocal[]> {
  const atual = exigir(itens, itemId);
  const meta: MetadadosItem = {
    cofreId: sessao.cofreId,
    itemId: deHex(itemId),
    revisao: atual.revisao + 1,
    criadoEm: atual.criadoEm,
    atualizadoEm: agora,
    apagado: true,
  };
  const blob = await sessao.cifrarItem(meta, new Uint8Array());
  return trocar(itens, itemDe(meta, blob, atual.cursor, atual.revisao));
}

export async function gravarNome(
  sessao: SessaoCofre,
  itens: ItemLocal[],
  nome: string,
  agora: bigint,
): Promise<ItemLocal[]> {
  const itemId = await idDoNome(sessao.cofreId);
  const id = paraHex(itemId);
  const atual = itens.find((item) => item.itemId === id);
  const texto = normalizarNome(nome);
  if (!texto) {
    if (!atual || atual.apagado) return itens;
    return excluirItem(sessao, itens, id, agora);
  }
  const claro = serializarNome(texto);
  try {
    const meta: MetadadosItem = {
      cofreId: sessao.cofreId,
      itemId,
      revisao: atual ? atual.revisao + 1 : 1,
      criadoEm: atual?.criadoEm ?? agora,
      atualizadoEm: agora,
      apagado: false,
    };
    const blob = await sessao.cifrarItem(meta, claro);
    const guardado: ItemLocal = {
      itemId: id,
      revisao: meta.revisao,
      criadoEm: meta.criadoEm,
      atualizadoEm: meta.atualizadoEm,
      apagado: false,
      blob,
      cursor: atual?.cursor ?? 0,
      pendente: true,
      revisaoBase: atual && !atual.apagado ? atual.revisao : atual?.revisao ?? 0,
      maiorRevisao: meta.revisao,
    };
    if (atual?.apagado) guardado.revisaoBase = atual.revisao;
    return atual ? trocar(itens, guardado) : [...itens, guardado];
  } finally {
    zerarMemoria(claro);
  }
}

export async function nomeDoCofre(sessao: SessaoCofre, itens: ItemLocal[]): Promise<string> {
  const id = paraHex(await idDoNome(sessao.cofreId));
  const item = itens.find((atual) => atual.itemId === id && !atual.apagado);
  if (!item) return '';
  const aberto = await sessao.decifrarItem(item.blob);
  try {
    return lerNome(aberto.conteudo) ?? '';
  } finally {
    zerarMemoria(aberto.conteudo);
  }
}

export async function lerConteudo(sessao: SessaoCofre, item: ItemLocal): Promise<ConteudoLogin> {
  const aberto = await sessao.decifrarItem(item.blob);
  try {
    return aberto.conteudo.length === 0 ? conteudoVazio() : lerLogin(aberto.conteudo);
  } finally {
    zerarMemoria(aberto.conteudo);
  }
}

function itemDe(meta: MetadadosItem, blob: Uint8Array, cursor: number, revisaoBase: number): ItemLocal {
  return {
    itemId: paraHex(meta.itemId),
    revisao: meta.revisao,
    criadoEm: meta.criadoEm,
    atualizadoEm: meta.atualizadoEm,
    apagado: meta.apagado,
    blob,
    cursor,
    pendente: true,
    revisaoBase,
    maiorRevisao: meta.revisao,
  };
}

function exigir(itens: ItemLocal[], itemId: string): ItemLocal {
  const atual = itens.find((item) => item.itemId === itemId.toLowerCase());
  if (!atual || atual.apagado) throw new Error('Item não encontrado.');
  return atual;
}

function trocar(itens: ItemLocal[], novo: ItemLocal): ItemLocal[] {
  return itens.map((item) => (item.itemId === novo.itemId ? novo : item));
}
