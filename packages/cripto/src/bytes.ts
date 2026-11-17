import {
  MAX_I64,
  MEMLIMIT_MINIMO,
  MEMLIMIT_SODIO_MIN,
  MEMLIMIT_TETO,
  OPSLIMIT_MINIMO,
  OPSLIMIT_SODIO_MIN,
  OPSLIMIT_TETO,
  SENHA_MAX_PONTOS,
  SENHA_MIN_PONTOS,
} from './constantes.js';
import { ErroCofre, type CodigoErro } from './erros.js';

export type ParametrosKdf = {
  opslimit: number;
  memlimit: number;
};

export function concatenar(...partes: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const parte of partes) total += parte.length;
  const saida = new Uint8Array(total);
  let cursor = 0;
  for (const parte of partes) {
    saida.set(parte, cursor);
    cursor += parte.length;
  }
  return saida;
}

export function byte(valor: number): Uint8Array {
  if (!Number.isInteger(valor) || valor < 0 || valor > 255) {
    throw new ErroCofre('formato_invalido', 'Byte fora da faixa.');
  }
  return Uint8Array.of(valor);
}

export function u32le(valor: number): Uint8Array {
  if (!Number.isInteger(valor) || valor < 0 || valor > 0xffffffff) {
    throw new ErroCofre('formato_invalido', 'Inteiro de 32 bits fora da faixa.');
  }
  const saida = new Uint8Array(4);
  new DataView(saida.buffer).setUint32(0, valor, true);
  return saida;
}

export function u64le(valor: bigint): Uint8Array {
  if (valor < 0n || valor > MAX_I64) {
    throw new ErroCofre('formato_invalido', 'Inteiro de 64 bits fora da faixa.');
  }
  const saida = new Uint8Array(8);
  new DataView(saida.buffer).setBigUint64(0, valor, true);
  return saida;
}

export function bytesIguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export class Leitor {
  #cursor = 0;

  constructor(private readonly buffer: Uint8Array) {}

  restam(): number {
    return this.buffer.length - this.#cursor;
  }

  bytes(quantidade: number): Uint8Array {
    if (!Number.isInteger(quantidade) || quantidade < 0 || this.restam() < quantidade) {
      throw new ErroCofre('formato_invalido', 'Bloco truncado.');
    }
    const fatia = this.buffer.slice(this.#cursor, this.#cursor + quantidade);
    this.#cursor += quantidade;
    return fatia;
  }

  u8(): number {
    return this.bytes(1)[0]!;
  }

  u32(): number {
    const bloco = this.bytes(4);
    return new DataView(bloco.buffer, bloco.byteOffset, 4).getUint32(0, true);
  }

  u64(): bigint {
    const bloco = this.bytes(8);
    const valor = new DataView(bloco.buffer, bloco.byteOffset, 8).getBigUint64(0, true);
    if (valor > MAX_I64) {
      throw new ErroCofre('formato_invalido', 'Inteiro fora da faixa.');
    }
    return valor;
  }

  exigirFim(): void {
    if (this.#cursor !== this.buffer.length) {
      throw new ErroCofre('formato_invalido', 'Sobraram bytes no final.');
    }
  }
}

/** Senha em UTF-8, forma NFC, entre 12 e 256 pontos de código. Não corta espaços. */
export function normalizarSenha(senha: string): Uint8Array {
  if (typeof senha !== 'string') {
    throw new ErroCofre('senha_recusada', 'A senha precisa ser um texto.');
  }
  const nfc = senha.normalize('NFC');
  for (let i = 0; i < nfc.length; i += 1) {
    const codigo = nfc.charCodeAt(i);
    if (codigo >= 0xd800 && codigo <= 0xdfff) {
      const par = i + 1 < nfc.length ? nfc.charCodeAt(i + 1) : 0;
      if (codigo >= 0xdc00 || par < 0xdc00 || par > 0xdfff) {
        throw new ErroCofre('senha_recusada', 'A senha tem caracteres inválidos.');
      }
      i += 1;
    }
  }
  const pontos = Array.from(nfc).length;
  if (pontos < SENHA_MIN_PONTOS || pontos > SENHA_MAX_PONTOS) {
    throw new ErroCofre('senha_recusada', 'A senha precisa ter entre 12 e 256 caracteres.');
  }
  return new TextEncoder().encode(nfc);
}

export type ModoParametros = 'abrir' | 'criar' | 'teste';

/**
 * Abrir aceita o que está gravado, até o teto.
 * Criar exige o piso militar.
 * Teste libera o piso, mas continua no teto e no mínimo do libsodium.
 */
export function validarParametros(parametros: ParametrosKdf, modo: ModoParametros): void {
  const codigo: CodigoErro = modo === 'abrir' ? 'formato_invalido' : 'parametros_fracos';
  const { opslimit, memlimit } = parametros;
  const inteiros = Number.isInteger(opslimit) && Number.isInteger(memlimit);
  const faixa =
    inteiros &&
    opslimit >= OPSLIMIT_SODIO_MIN &&
    opslimit <= OPSLIMIT_TETO &&
    memlimit >= MEMLIMIT_SODIO_MIN &&
    memlimit <= MEMLIMIT_TETO &&
    memlimit % 1024 === 0;
  if (!faixa) {
    throw new ErroCofre(codigo, 'Parâmetros de derivação inválidos.');
  }
  if (modo === 'criar' && (opslimit < OPSLIMIT_MINIMO || memlimit < MEMLIMIT_MINIMO)) {
    throw new ErroCofre('parametros_fracos', 'Os parâmetros de derivação estão abaixo do piso de segurança.');
  }
}
