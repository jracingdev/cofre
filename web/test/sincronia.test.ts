import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  PARAMETROS_KDF_TESTE,
  abrirCofre,
  criarCofre,
  lerCabecalho,
  lerPrefixoItem,
  verificarAssinaturaDesafio,
} from '@broquel/cripto';
import { deBase64, paraBase64, paraHex } from '../src/codec.ts';
import { alterarItem, excluirItem, incluirItem, lerConteudo } from '../src/itens.ts';
import { conteudoVazio } from '../src/item.ts';
import { criarCliente } from '../src/cliente.ts';
import {
  ConflitoSync,
  ErroSync,
  sincronizar,
  type Cabeca,
  type EstadoSync,
  type Pagina,
  type Relogio,
  type RespostaAuth,
  type Transporte,
} from '../src/sincronia.ts';

test('o aplicativo e o site trocam o mesmo item, conflito e marca de exclusão', async () => {
  const senha = 'correta-cavalo-bateria-broquel';
  const criado = await criarCofre(senha, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  const servidor = new ServidorFalso();
  const relogio = relogioFixo();
  const sessaoWeb = criado.sessao;
  const sessaoApp = await abrirCofre(criado.cabecalho, senha);
  let web: EstadoSync = {
    cofreId: '',
    cabecalho: criado.cabecalho,
    cursor: 0,
    aparelhoId: '',
    registrado: false,
    itens: [],
    apelido: '',
  };
  web.itens = await incluirItem(sessaoWeb, [], { ...conteudoVazio(), titulo: 'Banco', usuario: 'ana', senha: 'segredo-web' }, 1_700_000_000_000n, Uint8Array.from(randomBytes(16)));
  const ida = await sincronizar(web, sessaoWeb, servidor, null, relogio);
  web = ida.estado;
  assert.equal(servidor.viTexto('segredo-web'), false);

  let app: EstadoSync = {
    cofreId: ida.estado.cofreId,
    cabecalho: criado.cabecalho,
    cursor: 0,
    aparelhoId: paraHex(randomBytes(16)),
    registrado: true,
    itens: [],
    apelido: 'nao-enviar',
  };
  const vinda = await sincronizar(app, sessaoApp, servidor, null, relogio);
  app = vinda.estado;
  const recebido = app.itens.find((item) => !item.apagado);
  assert.ok(recebido);
  assert.equal((await lerConteudo(sessaoApp, recebido)).titulo, 'Banco');
  assert.equal((await lerConteudo(sessaoApp, recebido)).senha, 'segredo-web');

  app.itens = await alterarItem(sessaoApp, app.itens, recebido.itemId, { ...(await lerConteudo(sessaoApp, recebido)), senha: 'segredo-app' }, 1_700_000_000_100n);
  const publicado = await sincronizar(app, sessaoApp, servidor, null, relogio);
  app = publicado.estado;
  const deVolta = await sincronizar(web, sessaoWeb, servidor, null, relogio);
  web = deVolta.estado;
  const noSite = web.itens.find((item) => item.itemId === recebido.itemId);
  assert.ok(noSite);
  assert.equal((await lerConteudo(sessaoWeb, noSite)).senha, 'segredo-app');

  const baseWeb = noSite;
  const baseApp = app.itens.find((item) => item.itemId === recebido.itemId)!;
  web.itens = await alterarItem(sessaoWeb, web.itens, baseWeb.itemId, { ...(await lerConteudo(sessaoWeb, baseWeb)), titulo: 'Site' }, 1_700_000_000_200n);
  app.itens = await alterarItem(sessaoApp, app.itens, baseApp.itemId, { ...(await lerConteudo(sessaoApp, baseApp)), titulo: 'App' }, 1_700_000_000_300n);
  web = (await sincronizar(web, sessaoWeb, servidor, null, relogio)).estado;
  app = (await sincronizar(app, sessaoApp, servidor, null, relogio)).estado;
  const fork = app.itens.find((item) => item.itemId !== baseApp.itemId && !item.apagado);
  assert.ok(fork);
  assert.equal((await lerConteudo(sessaoApp, fork)).conflitoDe, baseApp.itemId);
  web = (await sincronizar(web, sessaoWeb, servidor, null, relogio)).estado;
  const noSiteDeNovo = web.itens.find((item) => item.itemId === fork.itemId);
  assert.ok(noSiteDeNovo);
  assert.equal((await lerConteudo(sessaoWeb, noSiteDeNovo)).conflitoDe, baseApp.itemId);

  app.itens = await excluirItem(sessaoApp, app.itens, baseApp.itemId, 1_700_000_000_400n);
  app = (await sincronizar(app, sessaoApp, servidor, null, relogio)).estado;
  web = (await sincronizar({ ...web, cursor: 0 }, sessaoWeb, servidor, null, relogio)).estado;
  const marca = web.itens.find((item) => item.itemId === baseApp.itemId);
  assert.equal(marca?.apagado, true);

  const guardado = web.itens.find((item) => item.itemId === baseApp.itemId)!;
  assert.ok(guardado.revisao > 1);
  servidor.rebaixar(ida.estado.cofreId, guardado.itemId);
  const retro = await sincronizar({ ...web, cursor: 0 }, sessaoWeb, servidor, null, relogio);
  assert.equal(retro.retrocesso, true);
  assert.equal(retro.estado.itens.find((item) => item.itemId === guardado.itemId)?.revisao, guardado.revisao);

  servidor.exigirTotp(ida.estado.cofreId, '123456');
  await assert.rejects(
    () => sincronizar(web, sessaoWeb, servidor, null, relogio),
    (erro: unknown) => erro instanceof ErroSync && erro.codigo === 'segundo_fator',
  );
  const comTotp = await sincronizar(web, sessaoWeb, servidor, { tipo: 'totp', codigo: '123456' }, relogio);
  assert.ok(comTotp.token);

  sessaoWeb.travar();
  sessaoApp.travar();
});

test('o cliente só envia cabeçalho e blob', async () => {
  const corpos: string[] = [];
  const buscar: typeof fetch = async (_url, init) => {
    if (typeof init?.body === 'string') corpos.push(init.body);
    const url = String(_url);
    if (url.endsWith('/cofre') && init?.method === 'POST') {
      const cab = deBase64(JSON.parse(String(init.body)).cabecalho as string);
      return json({ cofre_id: paraHex(lerCabecalho(cab).cofreId) }, 201);
    }
    if (url.endsWith('/auth/desafio')) return json({ desafio_id: 'd', desafio: paraBase64(new Uint8Array(32)) });
    if (url.endsWith('/auth/responder')) return json({ estado: 'sessao', token: 't' });
    if (url.endsWith('/cofre') && init?.method === 'PUT') return json({ cofre_id: 'x' });
    if (url.includes('/itens?')) return json({ itens: [], proximo_cursor: null, tem_mais: false });
    return json({ erro: 'formato_invalido', mensagem: 'não' }, 422);
  };
  const criado = await criarCofre('correta-cavalo-bateria-broquel', { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  const cliente = criarCliente(buscar);
  await sincronizar({
    cofreId: '',
    cabecalho: criado.cabecalho,
    cursor: 0,
    aparelhoId: 'ab'.repeat(16),
    registrado: false,
    itens: [],
    apelido: 'apelido-local-nao-sobe',
  }, criado.sessao, cliente, null, relogioFixo());
  assert.ok(corpos.length > 0);
  for (const corpo of corpos) {
    assert.equal(corpo.includes('correta-cavalo'), false);
    assert.equal(corpo.includes('segredo'), false);
    assert.equal(corpo.includes('apelido-local-nao-sobe'), false);
  }
  criado.sessao.travar();
});

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

function relogioFixo(): Relogio {
  let n = 0;
  return {
    agora: () => 1_700_000_001_000n,
    aleatorio: (tamanho) => {
      n += 1;
      const saida = new Uint8Array(tamanho);
      saida[0] = n;
      return saida;
    },
  };
}

class ServidorFalso implements Transporte {
  private cabecalhos = new Map<string, Uint8Array>();
  private guardados = new Map<string, Map<string, Cabeca>>();
  private desafios = new Map<string, { cofreId: string; bytes: Uint8Array; usado: boolean }>();
  private sessoes = new Map<string, string>();
  private codigosTotp = new Map<string, string>();
  private cursor = 0;
  private textos: string[] = [];

  viTexto(texto: string): boolean {
    return this.textos.some((item) => item.includes(texto));
  }

  exigirTotp(cofreId: string, codigo: string): void {
    this.codigosTotp.set(cofreId, codigo);
  }

  rebaixar(cofreId: string, itemId: string): void {
    const item = this.guardados.get(cofreId)?.get(itemId);
    if (!item) return;
    item.revisao = 1;
    this.cursor += 1;
    item.cursor = this.cursor;
  }

  async registrar(cabecalhoB64: string): Promise<string> {
    const bytes = deBase64(cabecalhoB64);
    const id = paraHex(lerCabecalho(bytes).cofreId);
    this.cabecalhos.set(id, bytes);
    this.guardados.set(id, new Map());
    this.textos.push(cabecalhoB64);
    return id;
  }

  async atualizarCabecalho(token: string, cabecalhoB64: string): Promise<void> {
    const id = this.exigirSessao(token);
    const bytes = deBase64(cabecalhoB64);
    if (paraHex(lerCabecalho(bytes).cofreId) !== id) throw new ErroSync('formato_invalido', 'outro cofre');
    this.cabecalhos.set(id, bytes);
    this.textos.push(cabecalhoB64);
  }

  async desafio(cofreId: string): Promise<{ desafio_id: string; desafio: string }> {
    const bytes = randomBytes(32);
    const id = paraHex(bytes);
    this.desafios.set(id, { cofreId, bytes, usado: false });
    return { desafio_id: id, desafio: paraBase64(bytes) };
  }

  async responder(desafioId: string, assinaturaB64: string, aparelhoId: string): Promise<RespostaAuth> {
    if (aparelhoId.length < 32) throw new ErroSync('formato_invalido', 'aparelho');
    const desafio = this.desafios.get(desafioId);
    if (!desafio || desafio.usado) throw new ErroSync('autenticacao_falhou', 'desafio');
    desafio.usado = true;
    const cab = lerCabecalho(this.cabecalhos.get(desafio.cofreId)!);
    const ok = await verificarAssinaturaDesafio(cab.chavePublicaAutenticacao, cab.cofreId, desafio.bytes, deBase64(assinaturaB64));
    if (!ok) throw new ErroSync('autenticacao_falhou', 'assinatura');
    const token = paraHex(randomBytes(16));
    if (this.codigosTotp.has(desafio.cofreId)) {
      this.sessoes.set(`pre:${token}`, desafio.cofreId);
      return { estado: 'segundo_fator', pre_token: token, metodos: ['totp'] };
    }
    this.sessoes.set(token, desafio.cofreId);
    return { estado: 'sessao', token };
  }

  async totp(preToken: string, codigo: string): Promise<string> {
    const cofreId = this.sessoes.get(`pre:${preToken}`);
    if (!cofreId || this.codigosTotp.get(cofreId) !== codigo) throw new ErroSync('autenticacao_falhou', 'código');
    const token = paraHex(randomBytes(16));
    this.sessoes.set(token, cofreId);
    return token;
  }

  async recuperacao(): Promise<string> {
    throw new ErroSync('autenticacao_falhou', 'não');
  }

  async opcoesLogin(): Promise<{ desafio_id: string; opcoes: unknown }> {
    return { desafio_id: 'x', opcoes: {} };
  }

  async confirmarLogin(): Promise<string> {
    throw new ErroSync('autenticacao_falhou', 'não');
  }

  async sair(token: string): Promise<void> {
    this.sessoes.delete(token);
  }

  async itens(token: string, cursor: number): Promise<Pagina> {
    const mapa = this.guardados.get(this.exigirSessao(token))!;
    const lista = [...mapa.values()].filter((item) => item.cursor > cursor).sort((a, b) => a.cursor - b.cursor);
    const pagina = lista.slice(0, 1);
    const ultimo = pagina.at(-1);
    return { itens: pagina, proximo_cursor: ultimo ? ultimo.cursor : null, tem_mais: lista.length > pagina.length };
  }

  async gravar(token: string, itemId: string, revisaoBase: number, blobB64: string): Promise<Cabeca> {
    const cofreId = this.exigirSessao(token);
    const blob = deBase64(blobB64);
    this.textos.push(new TextDecoder().decode(blob));
    const meta = lerPrefixoItem(blob);
    if (paraHex(meta.itemId) !== itemId || paraHex(meta.cofreId) !== cofreId) {
      throw new ErroSync('formato_invalido', 'item');
    }
    const mapa = this.guardados.get(cofreId)!;
    const atual = mapa.get(itemId);
    if (atual == null) {
      if (revisaoBase !== 0 || meta.revisao !== 1) throw new ConflitoSync(null);
    } else if (revisaoBase !== atual.revisao || meta.revisao !== atual.revisao + 1) {
      throw new ConflitoSync(atual);
    }
    this.cursor += 1;
    const cabeca: Cabeca = {
      item_id: itemId,
      revisao: meta.revisao,
      criado_em: Number(meta.criadoEm),
      atualizado_em: Number(meta.atualizadoEm),
      apagado: meta.apagado,
      blob: paraBase64(blob),
      cursor: this.cursor,
    };
    mapa.set(itemId, cabeca);
    return cabeca;
  }

  private exigirSessao(token: string): string {
    const id = this.sessoes.get(token);
    if (!id) throw new ErroSync('autenticacao_falhou', 'sessão');
    return id;
  }
}
