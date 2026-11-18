import { lerCabecalho, zerarMemoria, type MetadadosItem, type SessaoCofre } from '@broquel/cripto';
import { bytesAleatorios, bytesIguais, deBase64, deHex, paraBase64, paraHex } from './codec.js';
import { decidirConflito } from './conflito.js';
import { lerLogin, serializarLogin } from './item.js';

export class ErroSync extends Error {
  readonly codigo: string;
  readonly metodos: string[];

  constructor(codigo: string, mensagem: string, metodos: string[] = []) {
    super(mensagem);
    this.name = 'ErroSync';
    this.codigo = codigo;
    this.metodos = metodos;
  }
}

export class ConflitoSync extends ErroSync {
  readonly cabeca: Cabeca | null;

  constructor(cabeca: Cabeca | null) {
    super('conflito', 'Conflito de revisão.');
    this.cabeca = cabeca;
  }
}

export type ItemLocal = {
  itemId: string;
  revisao: number;
  criadoEm: bigint;
  atualizadoEm: bigint;
  apagado: boolean;
  blob: Uint8Array;
  cursor: number;
  pendente: boolean;
  revisaoBase: number;
  maiorRevisao: number;
};

export type EstadoSync = {
  cofreId: string;
  cabecalho: Uint8Array;
  cursor: number;
  aparelhoId: string;
  registrado: boolean;
  itens: ItemLocal[];
  /** Apelido só deste navegador. Não entra na sincronização. */
  apelido: string;
};

export type Cabeca = {
  item_id: string;
  revisao: number;
  criado_em: number;
  atualizado_em: number;
  apagado: boolean;
  blob: string;
  cursor: number;
};

export type Pagina = {
  itens: Cabeca[];
  proximo_cursor: number | null;
  tem_mais: boolean;
};

export type RespostaAuth =
  | { estado: 'sessao'; token: string }
  | { estado: 'segundo_fator'; pre_token: string; metodos: string[] };

export type Fator =
  | { tipo: 'totp'; codigo: string }
  | { tipo: 'recuperacao'; codigo: string }
  | {
      tipo: 'webauthn';
      concluir: (pedido: { desafio_id: string; opcoes: unknown }) => Promise<{ desafioId: string; credencial: unknown }>;
    };

export type Transporte = {
  registrar(cabecalhoB64: string): Promise<string>;
  atualizarCabecalho(token: string, cabecalhoB64: string): Promise<void>;
  desafio(cofreId: string): Promise<{ desafio_id: string; desafio: string }>;
  responder(desafioId: string, assinaturaB64: string, aparelhoId: string): Promise<RespostaAuth>;
  totp(preToken: string, codigo: string): Promise<string>;
  recuperacao(preToken: string, codigo: string): Promise<string>;
  opcoesLogin(preToken: string): Promise<{ desafio_id: string; opcoes: unknown }>;
  confirmarLogin(preToken: string, desafioId: string, credencial: unknown): Promise<string>;
  itens(token: string, cursor: number): Promise<Pagina>;
  gravar(token: string, itemId: string, revisaoBase: number, blobB64: string): Promise<Cabeca>;
  sair(token: string): Promise<void>;
};

export type Relogio = {
  agora(): bigint;
  aleatorio(tamanho: number): Uint8Array;
};

export type ResultadoSync = {
  estado: EstadoSync;
  token: string;
  retrocesso: boolean;
};

export function relogioReal(): Relogio {
  return {
    agora: () => BigInt(Date.now()),
    aleatorio: bytesAleatorios,
  };
}

export function estadoVazio(): EstadoSync {
  return { cofreId: '', cabecalho: new Uint8Array(), cursor: 0, aparelhoId: '', registrado: false, itens: [], apelido: '' };
}

export async function sincronizar(
  estado: EstadoSync,
  sessao: SessaoCofre,
  transporte: Transporte,
  fator: Fator | ((metodos: string[]) => Promise<Fator>) | null,
  relogio: Relogio = relogioReal(),
): Promise<ResultadoSync> {
  const idCabecalho = paraHex(lerCabecalho(estado.cabecalho).cofreId);
  if (paraHex(sessao.cofreId) !== idCabecalho) {
    throw new ErroSync('estado_invalido', 'A sessão não pertence a este cofre.');
  }
  let aparelhoId = estado.aparelhoId;
  if (!aparelhoId) aparelhoId = paraHex(relogio.aleatorio(16));
  let cofreId = estado.cofreId || idCabecalho;
  let registrado = estado.registrado;
  if (!registrado) {
    cofreId = (await transporte.registrar(paraBase64(estado.cabecalho))).toLowerCase();
    if (cofreId !== idCabecalho) throw new ErroSync('formato_invalido', 'O servidor devolveu outro cofre.');
    registrado = true;
  }
  const desafio = await transporte.desafio(cofreId);
  const assinatura = await sessao.assinarDesafio(deBase64(desafio.desafio));
  const resposta = await transporte.responder(desafio.desafio_id, paraBase64(assinatura), aparelhoId);
  const token = await tokenDaResposta(resposta, transporte, fator);
  await transporte.atualizarCabecalho(token, paraBase64(estado.cabecalho));

  let itens = estado.itens;
  for (let volta = 0; volta < 2; volta += 1) {
    const proximos: ItemLocal[] = [];
    for (const item of itens) {
      if (!item.pendente) {
        proximos.push(item);
        continue;
      }
      try {
        const gravado = await transporte.gravar(token, item.itemId, item.revisaoBase, paraBase64(item.blob));
        proximos.push({
          ...item,
          pendente: false,
          cursor: gravado.cursor,
          revisaoBase: gravado.revisao,
          maiorRevisao: Math.max(item.maiorRevisao, gravado.revisao),
        });
      } catch (erro) {
        if (!(erro instanceof ConflitoSync)) throw erro;
        proximos.push(...(await resolver(item, erro.cabeca, sessao, relogio)));
      }
    }
    itens = proximos;
  }

  let cursor = estado.cursor;
  const aviso = { retrocesso: false };
  while (true) {
    const pagina = await transporte.itens(token, cursor);
    for (const remoto of pagina.itens) {
      itens = fundir(itens, remoto, aviso);
      cursor = Math.max(cursor, remoto.cursor);
    }
    if (!pagina.tem_mais) break;
    const proximo = pagina.proximo_cursor ?? cursor;
    if (proximo <= cursor && pagina.itens.length === 0) break;
    cursor = proximo;
  }

  return {
    token,
    retrocesso: aviso.retrocesso,
    estado: { cofreId, cabecalho: estado.cabecalho, cursor, aparelhoId, registrado, itens, apelido: estado.apelido },
  };
}

/** Entra só para revogar as sessões deste aparelho. Não envia nem baixa itens. */
export async function encerrarSessao(
  estado: EstadoSync,
  sessao: SessaoCofre,
  transporte: Transporte,
  fator: Fator | ((metodos: string[]) => Promise<Fator>) | null,
  relogio: Relogio = relogioReal(),
): Promise<void> {
  if (!estado.registrado || !estado.cofreId) return;
  const aparelhoId = estado.aparelhoId || paraHex(relogio.aleatorio(16));
  const desafio = await transporte.desafio(estado.cofreId);
  const assinatura = await sessao.assinarDesafio(deBase64(desafio.desafio));
  const resposta = await transporte.responder(desafio.desafio_id, paraBase64(assinatura), aparelhoId);
  const token = await tokenDaResposta(resposta, transporte, fator);
  try {
    await transporte.sair(token);
  } catch (erro) {
    if (!(erro instanceof ErroSync) || erro.codigo !== 'autenticacao_falhou') throw erro;
  }
}

async function tokenDaResposta(
  resposta: RespostaAuth,
  transporte: Transporte,
  fator: Fator | ((metodos: string[]) => Promise<Fator>) | null,
): Promise<string> {
  if (resposta.estado === 'sessao') return resposta.token;
  const escolhido = typeof fator === 'function' ? await fator(resposta.metodos) : fator;
  if (!escolhido) throw new ErroSync('segundo_fator', 'Informe o segundo fator.', resposta.metodos);
  if (!resposta.metodos.includes(escolhido.tipo)) {
    throw new ErroSync('segundo_fator', 'Esse segundo fator não está ligado neste cofre.', resposta.metodos);
  }
  if (escolhido.tipo === 'totp') return transporte.totp(resposta.pre_token, escolhido.codigo);
  if (escolhido.tipo === 'recuperacao') return transporte.recuperacao(resposta.pre_token, escolhido.codigo);
  const pedido = await transporte.opcoesLogin(resposta.pre_token);
  const feito = await escolhido.concluir(pedido);
  return transporte.confirmarLogin(resposta.pre_token, feito.desafioId, feito.credencial);
}

async function resolver(local: ItemLocal, remoto: Cabeca | null, sessao: SessaoCofre, relogio: Relogio): Promise<ItemLocal[]> {
  if (!remoto) return [local];
  const blobRemoto = deBase64(remoto.blob);
  const igual = bytesIguais(local.blob, blobRemoto) && local.apagado === remoto.apagado;
  const mesmaBase = local.revisaoBase + 1 === local.revisao && remoto.revisao === local.revisao;
  const adotado = cabecaParaItem(remoto);
  const acao = decidirConflito(local.apagado, remoto.apagado, igual, mesmaBase);
  if (acao === 'adotar-servidor' || acao === 'reenviar-edicao-servidor') return [adotado];
  if (acao === 'reenviar-edicao-local') {
    const aberto = await sessao.decifrarItem(local.blob);
    try {
      const revisao = remoto.revisao + 1;
      const atualizadoEm = relogio.agora();
      const meta: MetadadosItem = {
        cofreId: sessao.cofreId,
        itemId: deHex(local.itemId),
        revisao,
        criadoEm: local.criadoEm,
        atualizadoEm,
        apagado: false,
      };
      const blob = await sessao.cifrarItem(meta, aberto.conteudo);
      return [{
        ...local,
        revisao,
        atualizadoEm,
        apagado: false,
        blob,
        pendente: true,
        revisaoBase: remoto.revisao,
        maiorRevisao: Math.max(local.maiorRevisao, revisao),
      }];
    } finally {
      zerarMemoria(aberto.conteudo);
    }
  }
  const aberto = await sessao.decifrarItem(local.blob);
  try {
    const login = lerLogin(aberto.conteudo);
    login.conflitoDe = local.itemId;
    const itemId = relogio.aleatorio(16);
    const agora = relogio.agora();
    const meta: MetadadosItem = {
      cofreId: sessao.cofreId,
      itemId,
      revisao: 1,
      criadoEm: agora,
      atualizadoEm: agora,
      apagado: false,
    };
    const blob = await sessao.cifrarItem(meta, serializarLogin(login));
    return [
      adotado,
      {
        itemId: paraHex(itemId),
        revisao: 1,
        criadoEm: agora,
        atualizadoEm: agora,
        apagado: false,
        blob,
        cursor: 0,
        pendente: true,
        revisaoBase: 0,
        maiorRevisao: 1,
      },
    ];
  } finally {
    zerarMemoria(aberto.conteudo);
  }
}

function fundir(itens: ItemLocal[], remoto: Cabeca, aviso: { retrocesso: boolean }): ItemLocal[] {
  const recebido = cabecaParaItem(remoto);
  const atual = itens.find((item) => item.itemId === recebido.itemId);
  if (!atual) return [...itens, recebido];
  if (atual.pendente) return itens;
  if (recebido.revisao < atual.maiorRevisao || recebido.revisao < atual.revisao) {
    aviso.retrocesso = true;
    return itens;
  }
  const adotado = { ...recebido, maiorRevisao: Math.max(atual.maiorRevisao, recebido.revisao) };
  return itens.map((item) => (item.itemId === recebido.itemId ? adotado : item));
}

function cabecaParaItem(remoto: Cabeca): ItemLocal {
  return {
    itemId: remoto.item_id.toLowerCase(),
    revisao: remoto.revisao,
    criadoEm: BigInt(remoto.criado_em),
    atualizadoEm: BigInt(remoto.atualizado_em),
    apagado: remoto.apagado,
    blob: deBase64(remoto.blob),
    cursor: remoto.cursor,
    pendente: false,
    revisaoBase: remoto.revisao,
    maiorRevisao: remoto.revisao,
  };
}
