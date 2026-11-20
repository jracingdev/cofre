/**
 * Lógica do cofre dentro da extensão, sem API do navegador (dá para testar no Node).
 * O formato é o mesmo do app e do site: nada aqui muda cabeçalho nem item.
 */
import {
  aadSenha,
  CHAVE_BYTES,
  derivarChaveEmbrulho,
  derivarChaveMestra,
  desenbrulharSegredo,
  idDoNome,
  lerCabecalho,
  preparar,
  SessaoCofre,
  zerarMemoria,
} from '@broquel/cripto';
import { bytesIguais, paraHex } from '../../web/src/codec.js';
import { conteudoVazio, type ConteudoLogin } from '../../web/src/item.js';
import { alterarItem, incluirItem, lerConteudo } from '../../web/src/itens.js';
import type { ItemLocal } from '../../web/src/sincronia.js';
import { combina, tituloDoHost } from './dominio.js';

/**
 * Abre o cofre com a senha mestra e devolve o segredo (chave do cofre + chave de assinatura).
 * É o mesmo caminho de abrirCofre(), mas devolvendo os bytes para guardar na memória
 * da sessão do navegador enquanto o cofre estiver destravado.
 */
export async function abrirSegredo(cabecalho: Uint8Array, senha: string): Promise<Uint8Array> {
  await preparar();
  const cab = lerCabecalho(cabecalho);
  const chaveMestra = await derivarChaveMestra(senha, cab.salt, { opslimit: cab.opslimit, memlimit: cab.memlimit });
  let embrulho: Uint8Array | null = null;
  try {
    embrulho = await derivarChaveEmbrulho(chaveMestra);
    const aad = aadSenha(cab.cofreId, cab.opslimit, cab.memlimit, cab.salt, cab.chavePublicaAutenticacao);
    const segredo = await desenbrulharSegredo(embrulho, cab.segredoEmbrulhadoSenha, aad);
    // A chave de assinatura Ed25519 do libsodium termina com a chave pública.
    if (!bytesIguais(segredo.subarray(segredo.length - 32), cab.chavePublicaAutenticacao)) {
      zerarMemoria(segredo);
      throw new Error('Não foi possível abrir o cofre.');
    }
    return segredo;
  } finally {
    zerarMemoria(chaveMestra, embrulho);
  }
}

/** Remonta a sessão a partir do segredo guardado. Quem chama trava a sessão ao terminar. */
export function sessaoDoSegredo(cabecalho: Uint8Array, segredo: Uint8Array): SessaoCofre {
  const cab = lerCabecalho(cabecalho);
  return new SessaoCofre(
    cab.cofreId,
    segredo.subarray(0, CHAVE_BYTES),
    segredo.subarray(CHAVE_BYTES),
    cab.chavePublicaAutenticacao,
  );
}

export type Conta = {
  id: string;
  titulo: string;
  usuario: string;
  url: string;
};

/** Lista os logins (sem a senha). Pula o item do nome do cofre e os apagados. */
export async function listarContas(sessao: SessaoCofre, itens: ItemLocal[]): Promise<Conta[]> {
  const idNome = paraHex(await idDoNome(sessao.cofreId));
  const contas: Conta[] = [];
  for (const item of itens) {
    if (item.apagado || item.itemId === idNome) continue;
    try {
      const conteudo = await lerConteudo(sessao, item);
      contas.push({ id: item.itemId, titulo: conteudo.titulo || 'Sem título', usuario: conteudo.usuario, url: conteudo.url });
    } catch {
      // Item ilegível ou de outro tipo: não entra no preenchimento.
    }
  }
  return contas.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

export function contasDoHost(contas: Conta[], host: string): Conta[] {
  return contas.filter((conta) => combina(conta.url, host));
}

export type Proposta =
  | { tipo: 'nova' }
  | { tipo: 'atualizar'; id: string; titulo: string }
  | { tipo: 'igual' };

/**
 * O que fazer com a senha digitada num site: se o mesmo usuário já existe para ele,
 * propõe trocar só a senha (como no Android); se a senha já é a guardada, nada a fazer.
 */
export async function proporGuardar(
  sessao: SessaoCofre,
  itens: ItemLocal[],
  host: string,
  usuario: string,
  senha: string,
): Promise<Proposta> {
  const contas = contasDoHost(await listarContas(sessao, itens), host);
  const alvo = usuario.trim().toLowerCase();
  const mesmas = contas.filter((conta) => conta.usuario.trim().toLowerCase() === alvo);
  for (const conta of mesmas) {
    const item = itens.find((atual) => atual.itemId === conta.id);
    if (!item) continue;
    const conteudo = await lerConteudo(sessao, item);
    const igual = conteudo.senha === senha;
    conteudo.senha = '';
    if (igual) return { tipo: 'igual' };
  }
  const primeira = mesmas[0];
  if (primeira) return { tipo: 'atualizar', id: primeira.id, titulo: primeira.titulo };
  return { tipo: 'nova' };
}

/** Grava a senha capturada: item novo ou troca da senha do item existente. */
export async function guardarSenha(
  sessao: SessaoCofre,
  itens: ItemLocal[],
  proposta: Proposta,
  host: string,
  usuario: string,
  senha: string,
  agora: bigint,
  itemIdNovo: Uint8Array,
): Promise<ItemLocal[]> {
  if (proposta.tipo === 'igual') return itens;
  if (proposta.tipo === 'atualizar') {
    const item = itens.find((atual) => atual.itemId === proposta.id);
    if (!item || item.apagado) throw new Error('Item não encontrado.');
    const conteudo = await lerConteudo(sessao, item);
    try {
      return await alterarItem(sessao, itens, proposta.id, { ...conteudo, senha }, agora);
    } finally {
      conteudo.senha = '';
    }
  }
  const novo: ConteudoLogin = {
    ...conteudoVazio(),
    titulo: tituloDoHost(host),
    usuario,
    senha,
    url: `https://${host}`,
  };
  return incluirItem(sessao, itens, novo, agora, itemIdNovo);
}

/** Lê usuário e senha de um item, só se ele servir para o host pedido. */
export async function credencialPara(
  sessao: SessaoCofre,
  itens: ItemLocal[],
  id: string,
  host: string,
): Promise<{ usuario: string; senha: string } | null> {
  const item = itens.find((atual) => atual.itemId === id.toLowerCase());
  if (!item || item.apagado) return null;
  const conteudo = await lerConteudo(sessao, item);
  if (!combina(conteudo.url, host)) {
    conteudo.senha = '';
    return null;
  }
  return { usuario: conteudo.usuario, senha: conteudo.senha };
}

/** Item qualquer, para copiar a senha no popup (sem regra de domínio: o usuário escolheu). */
export async function credencialDoItem(
  sessao: SessaoCofre,
  itens: ItemLocal[],
  id: string,
): Promise<{ usuario: string; senha: string } | null> {
  const item = itens.find((atual) => atual.itemId === id.toLowerCase());
  if (!item || item.apagado) return null;
  const conteudo = await lerConteudo(sessao, item);
  return { usuario: conteudo.usuario, senha: conteudo.senha };
}
