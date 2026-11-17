import { arquivoParaEstado, conferirArquivo, estadoParaArquivo, type ArquivoLocal } from './arquivo.js';
import type { EstadoSync } from './sincronia.js';

const BANCO = 'broquel';
const LOJA = 'arquivo';

export async function lerDeposito(): Promise<{ estado: EstadoSync; bloqueioSegundos: number } | null> {
  const db = await abrir();
  try {
    const valor = await pedir<ArquivoLocal | undefined>(db, 'readonly', (loja) => loja.get('cofre'));
    if (!valor) return null;
    return arquivoParaEstado(conferirArquivo(valor));
  } finally {
    db.close();
  }
}

export async function gravarDeposito(estado: EstadoSync, bloqueioSegundos: number): Promise<void> {
  const arquivo = estadoParaArquivo(estado, bloqueioSegundos);
  const db = await abrir();
  try {
    await pedir(db, 'readwrite', (loja) => loja.put(arquivo, 'cofre'));
  } finally {
    db.close();
  }
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA);
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error ?? new Error('Não foi possível abrir o arquivo local.'));
  });
}

function pedir<T>(db: IDBDatabase, modo: IDBTransactionMode, acao: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOJA, modo);
    const pedido = acao(tx.objectStore(LOJA));
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error ?? new Error('Falha ao gravar o arquivo local.'));
  });
}
