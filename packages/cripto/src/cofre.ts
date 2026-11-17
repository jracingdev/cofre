import {
  CHAVE_BYTES,
  CONTEXTO_KDF,
  NONCE_BYTES,
  PARAMETROS_KDF_PADRAO,
  SK_BYTES,
  SUBCHAVE_EMBRULHO,
} from './constantes.js';
import { ErroCofre } from './erros.js';
import { bytesIguais, normalizarSenha, validarParametros, type ParametrosKdf } from './bytes.js';
import {
  aadItem,
  aadKit,
  aadSenha,
  type Cabecalho,
  cifrarItemComNonce,
  decifrarItemComChave,
  desenbrulharSegredo,
  embrulharSegredo,
  type ItemAberto,
  lerBackup,
  lerCabecalho,
  type MetadadosItem,
  montarBackup,
  montarCabecalho,
  montarMensagemDesafio,
  parametrosDe,
} from './formato.js';
import { preparar, segredosIguais, sodium, zerar } from './sodio.js';
import { codificarKit, decodificarKit } from './kit.js';

export type OpcoesCriar = {
  parametros?: ParametrosKdf;
  /** Libera parâmetros baixos. Existe para testes e vetores. Cofre de verdade não usa. */
  permitirParametrosFracos?: boolean;
};

export class SessaoCofre {
  #travada = false;
  #cofreId: Uint8Array;
  #chaveCofre: Uint8Array;
  #authSk: Uint8Array;
  readonly chavePublicaAutenticacao: Uint8Array;

  constructor(cofreId: Uint8Array, chaveCofre: Uint8Array, authSk: Uint8Array, authPk: Uint8Array) {
    this.#cofreId = new Uint8Array(cofreId);
    this.#chaveCofre = new Uint8Array(chaveCofre);
    this.#authSk = new Uint8Array(authSk);
    this.chavePublicaAutenticacao = new Uint8Array(authPk);
  }

  get travada(): boolean {
    return this.#travada;
  }

  get cofreId(): Uint8Array {
    this.#exigirAberta();
    return new Uint8Array(this.#cofreId);
  }

  travar(): void {
    if (this.#travada) return;
    zerar(this.#chaveCofre, this.#authSk);
    this.#travada = true;
  }

  async cifrarItem(meta: MetadadosItem, conteudo: Uint8Array): Promise<Uint8Array> {
    await preparar();
    this.#exigirAberta();
    if (!bytesIguais(meta.cofreId, this.#cofreId)) {
      throw new ErroCofre('estado_invalido', 'O item não pertence a este cofre.');
    }
    return cifrarItemComNonce(this.#chaveCofre, meta, conteudo, sodium.randombytes_buf(NONCE_BYTES));
  }

  async decifrarItem(blob: Uint8Array): Promise<ItemAberto> {
    await preparar();
    this.#exigirAberta();
    const aberto = await decifrarItemComChave(this.#chaveCofre, blob);
    if (!bytesIguais(aberto.metadados.cofreId, this.#cofreId)) {
      zerar(aberto.conteudo);
      throw new ErroCofre('estado_invalido', 'O item não pertence a este cofre.');
    }
    return aberto;
  }

  async assinarDesafio(desafio: Uint8Array): Promise<Uint8Array> {
    await preparar();
    this.#exigirAberta();
    const mensagem = montarMensagemDesafio(this.#cofreId, desafio);
    return sodium.crypto_sign_detached(mensagem, this.#authSk);
  }

  /**
   * Troca a senha mestra. A chave do cofre continua a mesma, então os itens não são recifrados.
   * O kit de recuperação continua valendo.
   */
  async trocarSenhaMestra(
    cabecalho: Uint8Array,
    senhaNova: string,
    opcoes: OpcoesCriar = {},
  ): Promise<Uint8Array> {
    await preparar();
    this.#exigirAberta();
    const cab = this.#cabecalhoDaSessao(cabecalho);
    const parametros = opcoes.parametros ?? { ...PARAMETROS_KDF_PADRAO };
    validarParametros(parametros, opcoes.permitirParametrosFracos ? 'teste' : 'criar');
    const senhaBytes = normalizarSenha(senhaNova);
    const salt = sodium.randombytes_buf(16);
    const segredo = this.#segredo();
    let chaveMestra: Uint8Array | null = null;
    let embrulho: Uint8Array | null = null;
    try {
      chaveMestra = derivarChaveMestraBytes(senhaBytes, salt, parametros);
      embrulho = derivarChaveEmbrulhoBytes(chaveMestra);
      zerar(chaveMestra);
      chaveMestra = null;
      const nonce = sodium.randombytes_buf(24);
      const wrap = await embrulharSegredo(
        embrulho,
        nonce,
        aadSenha(cab.cofreId, parametros.opslimit, parametros.memlimit, salt, cab.chavePublicaAutenticacao),
        segredo,
      );
      return montarCabecalho({
        cofreId: cab.cofreId,
        opslimit: parametros.opslimit,
        memlimit: parametros.memlimit,
        salt,
        chavePublicaAutenticacao: cab.chavePublicaAutenticacao,
        segredoEmbrulhadoSenha: wrap,
        segredoEmbrulhadoKit: cab.segredoEmbrulhadoKit,
      });
    } finally {
      zerar(senhaBytes, chaveMestra, embrulho, segredo);
    }
  }

  /** Gera outro kit. O kit antigo deixa de abrir o cofre. A senha mestra continua a mesma. */
  async girarKitRecuperacao(cabecalho: Uint8Array): Promise<{ cabecalho: Uint8Array; kitRecuperacao: string }> {
    await preparar();
    this.#exigirAberta();
    const cab = this.#cabecalhoDaSessao(cabecalho);
    const kitSegredo = sodium.randombytes_buf(32);
    const segredo = this.#segredo();
    let embrulho: Uint8Array | null = null;
    try {
      embrulho = derivarChaveEmbrulhoBytes(kitSegredo);
      const nonce = sodium.randombytes_buf(24);
      const wrap = await embrulharSegredo(
        embrulho,
        nonce,
        aadKit(cab.cofreId, cab.chavePublicaAutenticacao),
        segredo,
      );
      const novo = montarCabecalho({
        ...cab,
        segredoEmbrulhadoKit: wrap,
      });
      const kitRecuperacao = await codificarKit(kitSegredo);
      return { cabecalho: novo, kitRecuperacao };
    } finally {
      zerar(kitSegredo, embrulho, segredo);
    }
  }

  #exigirAberta(): void {
    if (this.#travada) {
      throw new ErroCofre('estado_invalido', 'A sessão está travada.');
    }
  }

  #cabecalhoDaSessao(bytes: Uint8Array): Cabecalho {
    const cab = lerCabecalho(bytes);
    if (!bytesIguais(cab.cofreId, this.#cofreId) || !segredosIguais(cab.chavePublicaAutenticacao, this.chavePublicaAutenticacao)) {
      throw new ErroCofre('estado_invalido', 'O cabeçalho não pertence a esta sessão.');
    }
    return cab;
  }

  #segredo(): Uint8Array {
    const segredo = new Uint8Array(CHAVE_BYTES + SK_BYTES);
    segredo.set(this.#chaveCofre, 0);
    segredo.set(this.#authSk, CHAVE_BYTES);
    return segredo;
  }
}

export type CofreCriado = {
  cabecalho: Uint8Array;
  kitRecuperacao: string;
  sessao: SessaoCofre;
};

export async function criarCofre(senha: string, opcoes: OpcoesCriar = {}): Promise<CofreCriado> {
  await preparar();
  const parametros = opcoes.parametros ?? { ...PARAMETROS_KDF_PADRAO };
  validarParametros(parametros, opcoes.permitirParametrosFracos ? 'teste' : 'criar');
  const senhaBytes = normalizarSenha(senha);
  const salt = sodium.randombytes_buf(16);
  const cofreId = sodium.randombytes_buf(16);
  const chaveCofre = sodium.randombytes_buf(32);
  const par = sodium.crypto_sign_keypair();
  const authSk = new Uint8Array(par.privateKey);
  const authPk = new Uint8Array(par.publicKey);
  zerar(par.privateKey);
  const kitSegredo = sodium.randombytes_buf(32);
  const segredo = new Uint8Array(CHAVE_BYTES + SK_BYTES);
  segredo.set(chaveCofre, 0);
  segredo.set(authSk, CHAVE_BYTES);
  let chaveMestra: Uint8Array | null = null;
  let embrulhoSenha: Uint8Array | null = null;
  let embrulhoKit: Uint8Array | null = null;
  try {
    chaveMestra = derivarChaveMestraBytes(senhaBytes, salt, parametros);
    embrulhoSenha = derivarChaveEmbrulhoBytes(chaveMestra);
    zerar(chaveMestra);
    chaveMestra = null;
    const wrapSenha = await embrulharSegredo(
      embrulhoSenha,
      sodium.randombytes_buf(24),
      aadSenha(cofreId, parametros.opslimit, parametros.memlimit, salt, authPk),
      segredo,
    );
    zerar(embrulhoSenha);
    embrulhoSenha = null;
    embrulhoKit = derivarChaveEmbrulhoBytes(kitSegredo);
    const wrapKit = await embrulharSegredo(
      embrulhoKit,
      sodium.randombytes_buf(24),
      aadKit(cofreId, authPk),
      segredo,
    );
    const cabecalho = montarCabecalho({
      cofreId,
      opslimit: parametros.opslimit,
      memlimit: parametros.memlimit,
      salt,
      chavePublicaAutenticacao: authPk,
      segredoEmbrulhadoSenha: wrapSenha,
      segredoEmbrulhadoKit: wrapKit,
    });
    const kitRecuperacao = await codificarKit(kitSegredo);
    const sessao = new SessaoCofre(cofreId, chaveCofre, authSk, authPk);
    return { cabecalho, kitRecuperacao, sessao };
  } finally {
    zerar(senhaBytes, chaveCofre, authSk, kitSegredo, segredo, chaveMestra, embrulhoSenha, embrulhoKit);
  }
}

export async function abrirCofre(cabecalho: Uint8Array, senha: string): Promise<SessaoCofre> {
  await preparar();
  const cab = lerCabecalho(cabecalho);
  const senhaBytes = normalizarSenha(senha);
  let chaveMestra: Uint8Array | null = null;
  let embrulho: Uint8Array | null = null;
  try {
    chaveMestra = derivarChaveMestraBytes(senhaBytes, cab.salt, parametrosDe(cab));
    embrulho = derivarChaveEmbrulhoBytes(chaveMestra);
    zerar(chaveMestra);
    chaveMestra = null;
    const segredo = await desenbrulharSegredo(embrulho, cab.segredoEmbrulhadoSenha, aadSenhaDoCab(cab));
    return sessaoDoSegredo(cab, segredo);
  } finally {
    zerar(senhaBytes, chaveMestra, embrulho);
  }
}

export async function abrirComKit(cabecalho: Uint8Array, kit: string): Promise<SessaoCofre> {
  await preparar();
  const cab = lerCabecalho(cabecalho);
  const kitSegredo = await decodificarKit(kit);
  let embrulho: Uint8Array | null = null;
  try {
    embrulho = derivarChaveEmbrulhoBytes(kitSegredo);
    const segredo = await desenbrulharSegredo(embrulho, cab.segredoEmbrulhadoKit, aadKit(cab.cofreId, cab.chavePublicaAutenticacao));
    return sessaoDoSegredo(cab, segredo);
  } finally {
    zerar(kitSegredo, embrulho);
  }
}

export async function derivarChaveMestra(
  senha: string,
  salt: Uint8Array,
  parametros: ParametrosKdf,
): Promise<Uint8Array> {
  await preparar();
  validarParametros(parametros, 'teste');
  const senhaBytes = normalizarSenha(senha);
  try {
    return derivarChaveMestraBytes(senhaBytes, salt, parametros);
  } finally {
    zerar(senhaBytes);
  }
}

export async function derivarChaveEmbrulho(chave: Uint8Array): Promise<Uint8Array> {
  await preparar();
  return derivarChaveEmbrulhoBytes(chave);
}

export async function criarBackup(
  sessao: SessaoCofre,
  cabecalho: Uint8Array,
  itens: Uint8Array[],
): Promise<Uint8Array> {
  const cab = lerCabecalho(cabecalho);
  if (!bytesIguais(cab.cofreId, sessao.cofreId) || !segredosIguais(cab.chavePublicaAutenticacao, sessao.chavePublicaAutenticacao)) {
    throw new ErroCofre('estado_invalido', 'O cabeçalho não pertence a esta sessão.');
  }
  for (const item of itens) {
    const aberto = await sessao.decifrarItem(item);
    zerar(aberto.conteudo);
  }
  return montarBackup(cabecalho, itens);
}

export async function abrirBackup(
  backup: Uint8Array,
  credencial: { senha: string } | { kit: string },
): Promise<{ cabecalho: Uint8Array; sessao: SessaoCofre; itens: { blob: Uint8Array; aberto: ItemAberto }[] }> {
  const estrutura = lerBackup(backup);
  const sessao = 'senha' in credencial
    ? await abrirCofre(estrutura.cabecalho, credencial.senha)
    : await abrirComKit(estrutura.cabecalho, credencial.kit);
  try {
    const itens = [];
    for (const blob of estrutura.itens) {
      const aberto = await sessao.decifrarItem(blob);
      itens.push({ blob, aberto });
    }
    return { cabecalho: estrutura.cabecalho, sessao, itens };
  } catch (erro) {
    sessao.travar();
    throw erro;
  }
}

function derivarChaveMestraBytes(senha: Uint8Array, salt: Uint8Array, parametros: ParametrosKdf): Uint8Array {
  if (salt.length !== 16) {
    throw new ErroCofre('formato_invalido', 'Sal com tamanho inválido.');
  }
  return sodium.crypto_pwhash(
    32,
    senha,
    salt,
    parametros.opslimit,
    parametros.memlimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

function derivarChaveEmbrulhoBytes(chave: Uint8Array): Uint8Array {
  if (chave.length !== 32) {
    throw new ErroCofre('formato_invalido', 'Chave de derivação com tamanho inválido.');
  }
  return sodium.crypto_kdf_derive_from_key(32, SUBCHAVE_EMBRULHO, CONTEXTO_KDF, chave);
}

function aadSenhaDoCab(cab: Cabecalho): Uint8Array {
  return aadSenha(cab.cofreId, cab.opslimit, cab.memlimit, cab.salt, cab.chavePublicaAutenticacao);
}

function sessaoDoSegredo(cab: Cabecalho, segredo: Uint8Array): SessaoCofre {
  try {
    if (segredo.length !== CHAVE_BYTES + SK_BYTES) {
      throw new ErroCofre('formato_invalido', 'O segredo do cofre veio com tamanho inesperado.');
    }
    const chaveCofre = segredo.subarray(0, CHAVE_BYTES);
    const authSk = segredo.subarray(CHAVE_BYTES);
    const pk = sodium.crypto_sign_ed25519_sk_to_pk(authSk);
    if (!segredosIguais(pk, cab.chavePublicaAutenticacao)) {
      throw new ErroCofre('autenticacao_falhou', 'Não foi possível abrir o cofre.');
    }
    return new SessaoCofre(cab.cofreId, chaveCofre, authSk, pk);
  } finally {
    zerar(segredo);
  }
}
