import {
  ASSINATURA_BYTES,
  BLOCO_PREENCHIMENTO,
  CHAVE_BYTES,
  DESAFIO_BYTES,
  FLAGS_V1,
  ID_BYTES,
  KDF_ARGON2ID,
  MAGIC,
  MAX_BACKUP_BYTES,
  MAX_CONTEUDO,
  MAX_I64,
  MAX_ITENS_BACKUP,
  MIN_ITEM_BYTES,
  NONCE_BYTES,
  PK_BYTES,
  PREFIXO_ITEM,
  PROPOSITO_DESAFIO,
  PROPOSITO_ITEM,
  PROPOSITO_KIT,
  PROPOSITO_SENHA,
  SALT_BYTES,
  SEGREDO_BYTES,
  TAG_BYTES,
  TAMANHO_CABECALHO,
  TAMANHO_WRAP,
  TIPO_BACKUP,
  TIPO_CABECALHO,
  TIPO_ITEM,
  VERSAO_FORMATO,
} from './constantes.js';
import { ErroCofre } from './erros.js';
import {
  byte,
  bytesIguais,
  concatenar,
  Leitor,
  u32le,
  u64le,
  validarParametros,
  type ParametrosKdf,
} from './bytes.js';
import { cifrarAead, decifrarAead, preparar, sodium, zerar } from './sodio.js';

export type Cabecalho = {
  cofreId: Uint8Array;
  opslimit: number;
  memlimit: number;
  salt: Uint8Array;
  chavePublicaAutenticacao: Uint8Array;
  segredoEmbrulhadoSenha: Uint8Array;
  segredoEmbrulhadoKit: Uint8Array;
};

export type MetadadosItem = {
  cofreId: Uint8Array;
  itemId: Uint8Array;
  revisao: number;
  criadoEm: bigint;
  atualizadoEm: bigint;
  apagado: boolean;
};

export type ItemAberto = {
  metadados: MetadadosItem;
  conteudo: Uint8Array;
};

function lerCabeca(leitor: Leitor, tipoEsperado: number): void {
  const magic = leitor.bytes(MAGIC.length);
  if (!bytesIguais(magic, MAGIC)) {
    throw new ErroCofre('formato_invalido', 'Arquivo não reconhecido.');
  }
  const versao = leitor.u8();
  if (versao !== VERSAO_FORMATO) {
    throw new ErroCofre('versao_desconhecida', 'Versão de formato não suportada.');
  }
  const tipo = leitor.u8();
  if (tipo !== tipoEsperado) {
    throw new ErroCofre('formato_invalido', 'Tipo de registro inesperado.');
  }
}

export function tamanhoQuadro(conteudo: number): number {
  const bruto = 4 + conteudo;
  const blocos = Math.ceil(bruto / BLOCO_PREENCHIMENTO);
  return blocos * BLOCO_PREENCHIMENTO;
}

/** Coloca o tamanho real nos 4 primeiros bytes e completa com zeros até o bloco de 1 KiB. */
export function fecharQuadro(conteudo: Uint8Array): Uint8Array {
  if (!(conteudo instanceof Uint8Array)) {
    throw new ErroCofre('formato_invalido', 'O conteúdo precisa ser bytes.');
  }
  if (conteudo.length > MAX_CONTEUDO) {
    throw new ErroCofre('limite_excedido', 'O item passa do tamanho máximo.');
  }
  const quadro = new Uint8Array(tamanhoQuadro(conteudo.length));
  new DataView(quadro.buffer).setUint32(0, conteudo.length, true);
  quadro.set(conteudo, 4);
  return quadro;
}

export function abrirQuadro(quadro: Uint8Array): Uint8Array {
  if (quadro.length < BLOCO_PREENCHIMENTO || quadro.length % BLOCO_PREENCHIMENTO !== 0) {
    throw new ErroCofre('formato_invalido', 'Preenchimento do item inválido.');
  }
  const tamanho = new DataView(quadro.buffer, quadro.byteOffset, quadro.byteLength).getUint32(0, true);
  if (tamanho > MAX_CONTEUDO || 4 + tamanho > quadro.length) {
    throw new ErroCofre('formato_invalido', 'Tamanho do conteúdo inválido.');
  }
  for (let i = 4 + tamanho; i < quadro.length; i += 1) {
    if (quadro[i] !== 0) {
      throw new ErroCofre('formato_invalido', 'Preenchimento do item não é canônico.');
    }
  }
  return quadro.slice(4, 4 + tamanho);
}

export function aadSenha(
  cofreId: Uint8Array,
  opslimit: number,
  memlimit: number,
  salt: Uint8Array,
  chavePublica: Uint8Array,
): Uint8Array {
  return concatenar(
    MAGIC,
    byte(VERSAO_FORMATO),
    byte(TIPO_CABECALHO),
    byte(PROPOSITO_SENHA),
    cofreId,
    byte(KDF_ARGON2ID),
    u32le(opslimit),
    u64le(BigInt(memlimit)),
    salt,
    chavePublica,
  );
}

export function aadKit(cofreId: Uint8Array, chavePublica: Uint8Array): Uint8Array {
  return concatenar(
    MAGIC,
    byte(VERSAO_FORMATO),
    byte(TIPO_CABECALHO),
    byte(PROPOSITO_KIT),
    cofreId,
    chavePublica,
  );
}

export function aadItem(meta: MetadadosItem): Uint8Array {
  return concatenar(
    MAGIC,
    byte(VERSAO_FORMATO),
    byte(TIPO_ITEM),
    byte(PROPOSITO_ITEM),
    camposItem(meta),
  );
}

export function montarMensagemDesafio(cofreId: Uint8Array, desafio: Uint8Array): Uint8Array {
  if (cofreId.length !== ID_BYTES || desafio.length !== DESAFIO_BYTES) {
    throw new ErroCofre('formato_invalido', 'Desafio ou cofre com tamanho inválido.');
  }
  return concatenar(MAGIC, byte(VERSAO_FORMATO), byte(PROPOSITO_DESAFIO), cofreId, desafio);
}

function camposItem(meta: MetadadosItem): Uint8Array {
  validarMetadados(meta);
  return concatenar(
    meta.cofreId,
    meta.itemId,
    u32le(meta.revisao),
    u64le(meta.criadoEm),
    u64le(meta.atualizadoEm),
    byte(meta.apagado ? 1 : 0),
  );
}

export function validarMetadados(meta: MetadadosItem): void {
  if (meta.cofreId.length !== ID_BYTES || meta.itemId.length !== ID_BYTES) {
    throw new ErroCofre('formato_invalido', 'Identificador com tamanho inválido.');
  }
  if (!Number.isInteger(meta.revisao) || meta.revisao < 1 || meta.revisao > 0xffffffff) {
    throw new ErroCofre('formato_invalido', 'Revisão inválida.');
  }
  if (typeof meta.apagado !== 'boolean') {
    throw new ErroCofre('formato_invalido', 'Marca de exclusão inválida.');
  }
  validarInstante(meta.criadoEm);
  validarInstante(meta.atualizadoEm);
}

function validarInstante(valor: bigint): void {
  if (typeof valor !== 'bigint' || valor < 0n || valor > MAX_I64) {
    throw new ErroCofre('formato_invalido', 'Instante inválido.');
  }
}

export function montarCabecalho(cab: Cabecalho): Uint8Array {
  if (cab.cofreId.length !== ID_BYTES || cab.salt.length !== SALT_BYTES) {
    throw new ErroCofre('formato_invalido', 'Cabeçalho com campo de tamanho inválido.');
  }
  if (cab.chavePublicaAutenticacao.length !== PK_BYTES) {
    throw new ErroCofre('formato_invalido', 'Chave pública com tamanho inválido.');
  }
  if (cab.segredoEmbrulhadoSenha.length !== TAMANHO_WRAP || cab.segredoEmbrulhadoKit.length !== TAMANHO_WRAP) {
    throw new ErroCofre('formato_invalido', 'Embrulho do segredo com tamanho inválido.');
  }
  validarParametros({ opslimit: cab.opslimit, memlimit: cab.memlimit }, 'teste');
  const bytes = concatenar(
    MAGIC,
    byte(VERSAO_FORMATO),
    byte(TIPO_CABECALHO),
    byte(FLAGS_V1),
    cab.cofreId,
    byte(KDF_ARGON2ID),
    u32le(cab.opslimit),
    u64le(BigInt(cab.memlimit)),
    cab.salt,
    cab.chavePublicaAutenticacao,
    cab.segredoEmbrulhadoSenha,
    cab.segredoEmbrulhadoKit,
  );
  if (bytes.length !== TAMANHO_CABECALHO) {
    throw new ErroCofre('formato_invalido', 'Cabeçalho com tamanho inesperado.');
  }
  return bytes;
}

export function lerCabecalho(bytes: Uint8Array): Cabecalho {
  if (!(bytes instanceof Uint8Array) || bytes.length !== TAMANHO_CABECALHO) {
    throw new ErroCofre('formato_invalido', 'Cabeçalho com tamanho inválido.');
  }
  const leitor = new Leitor(bytes);
  lerCabeca(leitor, TIPO_CABECALHO);
  const flags = leitor.u8();
  if (flags !== FLAGS_V1) {
    throw new ErroCofre('formato_invalido', 'Bandeiras do cabeçalho não são as da versão 1.');
  }
  const cofreId = leitor.bytes(ID_BYTES);
  const algoritmo = leitor.u8();
  if (algoritmo !== KDF_ARGON2ID) {
    throw new ErroCofre('formato_invalido', 'Função de derivação desconhecida.');
  }
  const opslimit = leitor.u32();
  const memlimit = Number(leitor.u64());
  validarParametros({ opslimit, memlimit }, 'abrir');
  const salt = leitor.bytes(SALT_BYTES);
  const chavePublicaAutenticacao = leitor.bytes(PK_BYTES);
  const segredoEmbrulhadoSenha = leitor.bytes(TAMANHO_WRAP);
  const segredoEmbrulhadoKit = leitor.bytes(TAMANHO_WRAP);
  leitor.exigirFim();
  return {
    cofreId,
    opslimit,
    memlimit,
    salt,
    chavePublicaAutenticacao,
    segredoEmbrulhadoSenha,
    segredoEmbrulhadoKit,
  };
}

export async function embrulharSegredo(
  chaveEmbrulho: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  segredo: Uint8Array,
): Promise<Uint8Array> {
  await preparar();
  if (chaveEmbrulho.length !== CHAVE_BYTES || nonce.length !== NONCE_BYTES || segredo.length !== SEGREDO_BYTES) {
    throw new ErroCofre('formato_invalido', 'Embrulho com tamanho inválido.');
  }
  const cifrado = cifrarAead(chaveEmbrulho, nonce, aad, segredo);
  return concatenar(nonce, cifrado);
}

export async function desenbrulharSegredo(
  chaveEmbrulho: Uint8Array,
  blob: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  await preparar();
  if (blob.length !== TAMANHO_WRAP || chaveEmbrulho.length !== CHAVE_BYTES) {
    throw new ErroCofre('formato_invalido', 'Embrulho com tamanho inválido.');
  }
  const segredo = decifrarAead(chaveEmbrulho, blob.slice(0, NONCE_BYTES), aad, blob.slice(NONCE_BYTES));
  if (segredo.length !== SEGREDO_BYTES) {
    zerar(segredo);
    throw new ErroCofre('formato_invalido', 'O segredo do cofre veio com tamanho inesperado.');
  }
  return segredo;
}

function maiorQuadro(): number {
  return tamanhoQuadro(MAX_CONTEUDO);
}

export async function cifrarItemComNonce(
  chaveCofre: Uint8Array,
  meta: MetadadosItem,
  conteudo: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  await preparar();
  if (!(conteudo instanceof Uint8Array)) {
    throw new ErroCofre('formato_invalido', 'O conteúdo precisa ser bytes.');
  }
  if (chaveCofre.length !== CHAVE_BYTES || nonce.length !== NONCE_BYTES) {
    throw new ErroCofre('formato_invalido', 'Chave ou nonce do item inválido.');
  }
  const quadro = fecharQuadro(conteudo);
  try {
    const cifrado = cifrarAead(chaveCofre, nonce, aadItem(meta), quadro);
    return concatenar(
      MAGIC,
      byte(VERSAO_FORMATO),
      byte(TIPO_ITEM),
      camposItem(meta),
      nonce,
      cifrado,
    );
  } finally {
    zerar(quadro);
  }
}

export function lerPrefixoItem(blob: Uint8Array): MetadadosItem {
  if (!(blob instanceof Uint8Array) || blob.length < MIN_ITEM_BYTES) {
    throw new ErroCofre('formato_invalido', 'Item truncado.');
  }
  if (blob.length > PREFIXO_ITEM + maiorQuadro() + TAG_BYTES) {
    throw new ErroCofre('limite_excedido', 'O item passa do tamanho máximo.');
  }
  const leitor = new Leitor(blob.subarray(0, PREFIXO_ITEM));
  lerCabeca(leitor, TIPO_ITEM);
  const cofreId = leitor.bytes(ID_BYTES);
  const itemId = leitor.bytes(ID_BYTES);
  const revisao = leitor.u32();
  const criadoEm = leitor.u64();
  const atualizadoEm = leitor.u64();
  const apagadoByte = leitor.u8();
  if (apagadoByte !== 0 && apagadoByte !== 1) {
    throw new ErroCofre('formato_invalido', 'Marca de exclusão inválida.');
  }
  const meta: MetadadosItem = {
    cofreId,
    itemId,
    revisao,
    criadoEm,
    atualizadoEm,
    apagado: apagadoByte === 1,
  };
  validarMetadados(meta);
  const tamanhoCifrado = blob.length - PREFIXO_ITEM;
  if (
    tamanhoCifrado < BLOCO_PREENCHIMENTO + TAG_BYTES ||
    (tamanhoCifrado - TAG_BYTES) % BLOCO_PREENCHIMENTO !== 0
  ) {
    throw new ErroCofre('formato_invalido', 'Tamanho do texto cifrado inválido.');
  }
  return meta;
}

export async function decifrarItemComChave(chaveCofre: Uint8Array, blob: Uint8Array): Promise<ItemAberto> {
  await preparar();
  const meta = lerPrefixoItem(blob);
  if (chaveCofre.length !== CHAVE_BYTES) {
    throw new ErroCofre('formato_invalido', 'Chave do item inválida.');
  }
  const nonce = blob.slice(PREFIXO_ITEM - NONCE_BYTES, PREFIXO_ITEM);
  const cifrado = blob.slice(PREFIXO_ITEM);
  const quadro = decifrarAead(chaveCofre, nonce, aadItem(meta), cifrado);
  try {
    const conteudo = abrirQuadro(quadro);
    return { metadados: meta, conteudo };
  } finally {
    zerar(quadro);
  }
}

export function montarBackup(cabecalho: Uint8Array, itens: Uint8Array[]): Uint8Array {
  const cab = lerCabecalho(cabecalho);
  if (itens.length > MAX_ITENS_BACKUP) {
    throw new ErroCofre('limite_excedido', 'Backup com itens demais.');
  }
  const partes: Uint8Array[] = [
    MAGIC,
    byte(VERSAO_FORMATO),
    byte(TIPO_BACKUP),
    byte(FLAGS_V1),
    cab.cofreId,
    u32le(cabecalho.length),
    cabecalho,
    u32le(itens.length),
  ];
  for (const item of itens) {
    const meta = lerPrefixoItem(item);
    if (!bytesIguais(meta.cofreId, cab.cofreId)) {
      throw new ErroCofre('formato_invalido', 'Item de outro cofre no backup.');
    }
    partes.push(u32le(item.length), item);
  }
  const backup = concatenar(...partes);
  if (backup.length > MAX_BACKUP_BYTES) {
    throw new ErroCofre('limite_excedido', 'Backup passa do tamanho máximo.');
  }
  return backup;
}

export function lerBackup(bytes: Uint8Array): { cabecalho: Uint8Array; itens: Uint8Array[] } {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BACKUP_BYTES) {
    throw new ErroCofre('limite_excedido', 'Backup passa do tamanho máximo.');
  }
  const leitor = new Leitor(bytes);
  lerCabeca(leitor, TIPO_BACKUP);
  if (leitor.u8() !== FLAGS_V1) {
    throw new ErroCofre('formato_invalido', 'Bandeiras do backup não são as da versão 1.');
  }
  const cofreId = leitor.bytes(ID_BYTES);
  const tamanhoCabecalho = leitor.u32();
  if (tamanhoCabecalho !== TAMANHO_CABECALHO) {
    throw new ErroCofre('formato_invalido', 'Cabeçalho do backup com tamanho inválido.');
  }
  const cabecalho = leitor.bytes(tamanhoCabecalho);
  const cab = lerCabecalho(cabecalho);
  if (!bytesIguais(cab.cofreId, cofreId)) {
    throw new ErroCofre('formato_invalido', 'Identificador do backup não bate com o cabeçalho.');
  }
  const quantidade = leitor.u32();
  if (quantidade > MAX_ITENS_BACKUP) {
    throw new ErroCofre('limite_excedido', 'Backup com itens demais.');
  }
  const itens: Uint8Array[] = [];
  for (let i = 0; i < quantidade; i += 1) {
    const tamanho = leitor.u32();
    const item = leitor.bytes(tamanho);
    const meta = lerPrefixoItem(item);
    if (!bytesIguais(meta.cofreId, cofreId)) {
      throw new ErroCofre('formato_invalido', 'Item de outro cofre no backup.');
    }
    itens.push(item);
  }
  leitor.exigirFim();
  return { cabecalho, itens };
}

export async function assinarDesafioComChave(
  chaveSecreta: Uint8Array,
  cofreId: Uint8Array,
  desafio: Uint8Array,
): Promise<Uint8Array> {
  await preparar();
  const mensagem = montarMensagemDesafio(cofreId, desafio);
  const assinatura = sodium.crypto_sign_detached(mensagem, chaveSecreta);
  if (assinatura.length !== ASSINATURA_BYTES) {
    throw new ErroCofre('formato_invalido', 'Assinatura com tamanho inesperado.');
  }
  return assinatura;
}

export async function verificarAssinaturaDesafio(
  chavePublica: Uint8Array,
  cofreId: Uint8Array,
  desafio: Uint8Array,
  assinatura: Uint8Array,
): Promise<boolean> {
  await preparar();
  if (chavePublica.length !== PK_BYTES || assinatura.length !== ASSINATURA_BYTES) return false;
  const mensagem = montarMensagemDesafio(cofreId, desafio);
  return sodium.crypto_sign_verify_detached(assinatura, mensagem, chavePublica);
}

export function parametrosDe(cab: Cabecalho): ParametrosKdf {
  return { opslimit: cab.opslimit, memlimit: cab.memlimit };
}
