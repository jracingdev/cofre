import { deBase64, deHex, paraBase64 } from './codec.js';
import type { EstadoSync, ItemLocal } from './sincronia.js';

const CAMPOS = ['cofreId', 'cabecalhoB64', 'cursor', 'aparelhoId', 'bloqueioSegundos', 'registrado', 'itens'] as const;
const CAMPOS_ITEM = ['itemId', 'revisao', 'criadoEm', 'atualizadoEm', 'apagado', 'blobB64', 'cursor', 'pendente', 'revisaoBase', 'maiorRevisao'] as const;
const PROIBIDOS = ['senha', 'token', 'kit', 'chave', 'segredo', 'authsk', 'pre_token', 'plaintext'];

export type ItemArquivo = {
  itemId: string;
  revisao: number;
  criadoEm: string;
  atualizadoEm: string;
  apagado: boolean;
  blobB64: string;
  cursor: number;
  pendente: boolean;
  revisaoBase: number;
  maiorRevisao: number;
};

export type ArquivoLocal = {
  cofreId: string;
  cabecalhoB64: string;
  cursor: number;
  aparelhoId: string;
  bloqueioSegundos: number;
  registrado: boolean;
  itens: ItemArquivo[];
};

export function conferirArquivo(valor: unknown): ArquivoLocal {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('Arquivo local inválido.');
  }
  const registro = valor as Record<string, unknown>;
  recusarChaves(registro, CAMPOS);
  if (!Array.isArray(registro.itens)) throw new Error('Arquivo local inválido.');
  for (const item of registro.itens) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Arquivo local inválido.');
    recusarChaves(item as Record<string, unknown>, CAMPOS_ITEM);
  }
  return valor as ArquivoLocal;
}

function recusarChaves(registro: Record<string, unknown>, permitidos: readonly string[]): void {
  for (const chave of Object.keys(registro)) {
    if (PROIBIDOS.some((proibido) => chave.toLowerCase().includes(proibido))) {
      throw new Error('O arquivo local não pode guardar segredo.');
    }
    if (!permitidos.includes(chave)) throw new Error('O arquivo local tem um campo desconhecido.');
  }
}

export function estadoParaArquivo(estado: EstadoSync, bloqueioSegundos: number): ArquivoLocal {
  return conferirArquivo({
    cofreId: estado.cofreId,
    cabecalhoB64: paraBase64(estado.cabecalho),
    cursor: estado.cursor,
    aparelhoId: estado.aparelhoId,
    bloqueioSegundos,
    registrado: estado.registrado,
    itens: estado.itens.map((item) => ({
      itemId: item.itemId,
      revisao: item.revisao,
      criadoEm: item.criadoEm.toString(),
      atualizadoEm: item.atualizadoEm.toString(),
      apagado: item.apagado,
      blobB64: paraBase64(item.blob),
      cursor: item.cursor,
      pendente: item.pendente,
      revisaoBase: item.revisaoBase,
      maiorRevisao: item.maiorRevisao,
    })),
  });
}

export function arquivoParaEstado(arquivo: ArquivoLocal): { estado: EstadoSync; bloqueioSegundos: number } {
  const conferido = conferirArquivo(arquivo);
  return {
    bloqueioSegundos: Math.min(300, Math.max(15, conferido.bloqueioSegundos || 60)),
    estado: {
      cofreId: conferido.cofreId,
      cabecalho: deBase64(conferido.cabecalhoB64),
      cursor: conferido.cursor,
      aparelhoId: conferido.aparelhoId,
      registrado: conferido.registrado,
      itens: conferido.itens.map((item) => itemDeArquivo(item)),
    },
  };
}

function itemDeArquivo(item: ItemArquivo): ItemLocal {
  if (deHex(item.itemId).length !== 16) throw new Error('Item local inválido.');
  return {
    itemId: item.itemId.toLowerCase(),
    revisao: item.revisao,
    criadoEm: BigInt(item.criadoEm),
    atualizadoEm: BigInt(item.atualizadoEm),
    apagado: item.apagado,
    blob: deBase64(item.blobB64),
    cursor: item.cursor,
    pendente: item.pendente,
    revisaoBase: item.revisaoBase,
    maiorRevisao: item.maiorRevisao,
  };
}
