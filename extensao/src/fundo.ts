/**
 * Fundo da extensão (service worker no Chrome/Edge, script de fundo no Firefox).
 * Único lugar que vê a chave do cofre. A chave fica em chrome.storage.session:
 * só na memória, some ao fechar o navegador, e o script das páginas não lê.
 */
import { estadoInicial, gerarSenha, lerCabecalho, preparar, type SessaoCofre } from '@broquel/cripto';
import { arquivoParaEstado, estadoParaArquivo, type ArquivoLocal } from '../../web/src/arquivo.js';
import { criarCliente } from '../../web/src/cliente.js';
import { bytesAleatorios, deBase64, paraBase64, paraHex } from '../../web/src/codec.js';
import { nomeDoCofre } from '../../web/src/itens.js';
import {
  ErroSync,
  estadoVazio,
  relogioReal,
  sincronizar,
  type EstadoSync,
  type Fator,
  type Transporte,
} from '../../web/src/sincronia.js';
import { hostDaPagina, paginaConfiavel } from './dominio.js';
import type { Estado, OrdemPagina, PendenteResumo, Pedido, Resposta } from './mensagens.js';
import {
  abrirSegredo,
  contasDoHost,
  credencialDoItem,
  credencialPara,
  guardarSenha,
  listarContas,
  proporGuardar,
  sessaoDoSegredo,
} from './nucleo.js';

/** Definido no build (scripts/build.mjs). Fixo: a extensão só fala com o servidor do Broquel. */
declare const __SERVIDOR__: string;
const SERVIDOR = __SERVIDOR__;
const TRAVA_PADRAO = 15;
const TRAVAS = [5, 15, 60];
/** Quanto tempo uma senha digitada espera a decisão de guardar. */
const PENDENTE_MS = 3 * 60_000;

const cliente = criarCliente(fetch.bind(globalThis), SERVIDOR);
const relogio = relogioReal();

type Pendente = { host: string; usuario: string; senha: string; quando: number };

type Sessao = {
  segredo?: string;
  token?: string;
  ultimoUso?: number;
  precisaFator?: string[];
  avisoSync?: string;
  ultimaSync?: number;
  pendentes?: Record<string, Pendente>;
};

// ---------- armazenamento ----------

async function lerSessao(): Promise<Sessao> {
  return (await chrome.storage.session.get(null)) as Sessao;
}

async function gravarSessao(parcial: Partial<Sessao>): Promise<void> {
  await chrome.storage.session.set(parcial);
}

async function lerCofre(): Promise<EstadoSync | null> {
  const { arquivo } = (await chrome.storage.local.get('arquivo')) as { arquivo?: ArquivoLocal };
  if (!arquivo) return null;
  return arquivoParaEstado(arquivo).estado;
}

async function gravarCofre(estado: EstadoSync): Promise<void> {
  // A cópia local guarda só blobs cifrados, igual ao site (arquivo.ts recusa campo de segredo).
  await chrome.storage.local.set({ arquivo: estadoParaArquivo(estado, 60) });
}

async function travaMinutos(): Promise<number> {
  const { travaMinutos: valor } = (await chrome.storage.local.get('travaMinutos')) as { travaMinutos?: number };
  return TRAVAS.includes(Number(valor)) ? Number(valor) : TRAVA_PADRAO;
}

// ---------- fila: uma alteração do cofre por vez ----------

let fila: Promise<unknown> = Promise.resolve();
function emFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const proxima = fila.then(tarefa, tarefa);
  fila = proxima.catch(() => undefined);
  return proxima;
}

// ---------- sessão aberta ----------

/**
 * Abre a sessão a partir do segredo da memória, executa e trava de novo.
 * `uso` renova o prazo de trava. Mostrar sugestões ao focar um campo não renova:
 * senão uma página poderia manter o cofre aberto só focando campos.
 */
async function comSessao<T>(acao: (sessao: SessaoCofre, estado: EstadoSync) => Promise<T>, uso = true): Promise<T> {
  await preparar();
  const [dados, estado] = await Promise.all([lerSessao(), lerCofre()]);
  if (!estado) throw new Error('Conecte o seu cofre primeiro.');
  if (!dados.segredo) throw new Error('O Broquel está travado.');
  if (await expirou(dados)) {
    await travar();
    throw new Error('O Broquel está travado.');
  }
  const segredo = deBase64(dados.segredo);
  const sessao = sessaoDoSegredo(estado.cabecalho, segredo);
  segredo.fill(0);
  try {
    const resultado = await acao(sessao, estado);
    if (uso) await gravarSessao({ ultimoUso: Date.now() });
    return resultado;
  } finally {
    sessao.travar();
  }
}

async function expirou(dados: Sessao): Promise<boolean> {
  if (!dados.segredo) return false;
  const limite = (await travaMinutos()) * 60_000;
  return Date.now() - (dados.ultimoUso ?? 0) >= limite;
}

async function travar(): Promise<void> {
  await chrome.storage.session.remove(['segredo', 'ultimoUso']);
  await atualizarIcone(false);
}

async function atualizarIcone(aberto: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text: aberto ? '' : '•' });
    await chrome.action.setBadgeBackgroundColor({ color: '#64748b' });
    await chrome.action.setTitle({ title: aberto ? 'Broquel (destravado)' : 'Broquel (travado)' });
  } catch {
    // Sem ícone na barra (por exemplo, durante testes).
  }
}

// ---------- sincronização ----------

/**
 * Reaproveita o token desta sessão do navegador. Assim o TOTP só é pedido de novo
 * quando o servidor encerrar a sessão (BROQUEL_SESSAO_MINUTOS), e não a cada envio.
 */
function transporteComToken(token: string): Transporte {
  return {
    registrar: (c) => cliente.registrar(c),
    atualizarCabecalho: (t, c) => cliente.atualizarCabecalho(t, c),
    desafio: async () => ({ desafio_id: 'sessao-atual', desafio: paraBase64(new Uint8Array(32)) }),
    responder: async () => ({ estado: 'sessao', token }),
    totp: (p, c) => cliente.totp(p, c),
    recuperacao: (p, c) => cliente.recuperacao(p, c),
    opcoesLogin: (p) => cliente.opcoesLogin(p),
    confirmarLogin: (p, d, c) => cliente.confirmarLogin(p, d, c),
    itens: (t, c) => cliente.itens(t, c),
    gravar: (t, i, r, b) => cliente.gravar(t, i, r, b),
    sair: (t) => cliente.sair(t),
  };
}

async function sincronizarAgora(fator: Fator | null): Promise<void> {
  await emFila(async () => {
    const dados = await lerSessao();
    try {
      await comSessao(async (sessao, estado) => {
        let resultado = null;
        if (dados.token && !fator) {
          try {
            resultado = await sincronizar(estado, sessao, transporteComToken(dados.token), null, relogio);
          } catch (erro) {
            if (!(erro instanceof ErroSync) || erro.codigo !== 'autenticacao_falhou') throw erro;
          }
        }
        resultado ??= await sincronizar(estado, sessao, cliente, fator, relogio);
        await gravarCofre(resultado.estado);
        await gravarSessao({
          token: resultado.token,
          precisaFator: [],
          ultimaSync: Date.now(),
          avisoSync: resultado.retrocesso ? 'O servidor ofereceu uma revisão antiga e ela foi ignorada.' : '',
        });
      }, false);
    } catch (erro) {
      if (erro instanceof ErroSync && erro.codigo === 'segundo_fator') {
        await chrome.storage.session.remove('token');
        await gravarSessao({ precisaFator: erro.metodos, avisoSync: '' });
        if (fator) throw erro;
        return;
      }
      await gravarSessao({ avisoSync: mensagem(erro) });
      throw erro;
    }
  });
}

/** Envia em segundo plano o que foi guardado. Sem token válido, fica para a próxima sincronização. */
function enviarDepois(): void {
  void sincronizarAgora(null).catch(() => undefined);
}

// ---------- estado para o popup ----------

async function estadoAtual(): Promise<Estado> {
  const [dados, estado] = await Promise.all([lerSessao(), lerCofre()]);
  if (dados.segredo && (await expirou(dados))) await travar();
  const aberto = Boolean((await lerSessao()).segredo) && Boolean(estado);
  let nome = estado?.apelido ?? '';
  if (aberto && estado) {
    try {
      nome = (await comSessao((sessao, atual) => nomeDoCofre(sessao, atual.itens))) || nome;
    } catch {
      // Sem nome: mostra só o identificador.
    }
  }
  return {
    configurado: Boolean(estado),
    aberto,
    identificador: estado ? paraHex(lerCabecalho(estado.cabecalho).cofreId) : '',
    nome,
    travaMinutos: await travaMinutos(),
    precisaFator: dados.precisaFator ?? [],
    pendentesEnvio: estado ? estado.itens.filter((item) => item.pendente).length : 0,
    ultimaSync: dados.ultimaSync ?? 0,
    avisoSync: dados.avisoSync ?? '',
  };
}

// ---------- senhas digitadas nas páginas ----------

async function pendenteDaAba(abaId: number): Promise<Pendente | null> {
  const { pendentes = {} } = await lerSessao();
  const pendente = pendentes[String(abaId)];
  if (!pendente) return null;
  if (Date.now() - pendente.quando > PENDENTE_MS) {
    await esquecerPendente(abaId);
    return null;
  }
  return pendente;
}

async function esquecerPendente(abaId: number): Promise<void> {
  const { pendentes = {} } = await lerSessao();
  delete pendentes[String(abaId)];
  await gravarSessao({ pendentes });
}

async function resumoPendente(abaId: number): Promise<PendenteResumo | null> {
  const pendente = await pendenteDaAba(abaId);
  if (!pendente) return null;
  if (!(await lerCofre())) return null;
  const dados = await lerSessao();
  if (!dados.segredo || (await expirou(dados))) {
    return { host: pendente.host, usuario: pendente.usuario, tipo: 'travado' };
  }
  const proposta = await comSessao((sessao, estado) => proporGuardar(sessao, estado.itens, pendente.host, pendente.usuario, pendente.senha), false);
  if (proposta.tipo === 'igual') {
    await esquecerPendente(abaId);
    return null;
  }
  return proposta.tipo === 'atualizar'
    ? { host: pendente.host, usuario: pendente.usuario, tipo: 'atualizar', titulo: proposta.titulo }
    : { host: pendente.host, usuario: pendente.usuario, tipo: 'nova' };
}

async function decidir(abaId: number, guardar: boolean): Promise<void> {
  const pendente = await pendenteDaAba(abaId);
  if (!pendente) return;
  if (!guardar) {
    await esquecerPendente(abaId);
    return;
  }
  await emFila(() =>
    comSessao(async (sessao, estado) => {
      const proposta = await proporGuardar(sessao, estado.itens, pendente.host, pendente.usuario, pendente.senha);
      const itens = await guardarSenha(
        sessao,
        estado.itens,
        proposta,
        pendente.host,
        pendente.usuario,
        pendente.senha,
        relogio.agora(),
        bytesAleatorios(16),
      );
      await gravarCofre({ ...estado, itens });
    }),
  );
  await esquecerPendente(abaId);
  enviarDepois();
}

// ---------- tratamento das mensagens ----------

/** Página da própria extensão (popup). Nenhum site consegue abrir popup.html: não é recurso acessível pela web. */
function ehDoPopup(remetente: chrome.runtime.MessageSender): boolean {
  const base = chrome.runtime.getURL('');
  if (typeof remetente.url !== 'string' || !remetente.url.startsWith(base)) return false;
  return !remetente.tab || (remetente.tab.url ?? '').startsWith(base);
}

async function tratar(pedido: Pedido, remetente: chrome.runtime.MessageSender): Promise<unknown> {
  if (remetente.id !== chrome.runtime.id) throw new Error('Pedido recusado.');
  if (pedido.origem === 'popup') {
    if (!ehDoPopup(remetente)) throw new Error('Pedido recusado.');
    return tratarPopup(pedido);
  }
  // Só o quadro de topo da aba conversa com o cofre: iframes (anúncios, widgets) ficam de fora.
  if (!remetente.tab?.id || remetente.frameId !== 0) throw new Error('Pedido recusado.');
  // O host vem do navegador (remetente.url), nunca do que a página diz.
  const pagina = hostDaPagina(remetente.url);
  if (!pagina || !paginaConfiavel(pagina)) throw new Error('Pedido recusado.');
  return tratarPagina(pedido, remetente.tab.id, pagina.host);
}

async function tratarPopup(pedido: Pedido): Promise<unknown> {
  switch (pedido.tipo) {
    case 'estado':
      return estadoAtual();
    case 'conectar': {
      const id = pedido.identificador.trim().toLowerCase();
      if (!/^[0-9a-f]{32}$/u.test(id)) throw new Error('O identificador tem 32 caracteres (0-9 e a-f). Veja em Ajustes no app ou no site.');
      const cabecalho = deBase64(await cliente.cabecalho(id));
      if (paraHex(lerCabecalho(cabecalho).cofreId) !== id) throw new Error('O cabeçalho não bate com o identificador.');
      const segredo = await abrirSegredo(cabecalho, pedido.senha).catch(() => {
        throw new Error('Senha mestra incorreta.');
      });
      await gravarCofre({ ...estadoVazio(), cofreId: id, cabecalho, registrado: true });
      await gravarSessao({ segredo: paraBase64(segredo), ultimoUso: Date.now(), precisaFator: [], avisoSync: '' });
      segredo.fill(0);
      await atualizarIcone(true);
      await sincronizarAgora(null).catch(() => undefined);
      return estadoAtual();
    }
    case 'destravar': {
      const estado = await lerCofre();
      if (!estado) throw new Error('Conecte o seu cofre primeiro.');
      const segredo = await abrirSegredo(estado.cabecalho, pedido.senha).catch(() => {
        throw new Error('Senha mestra incorreta.');
      });
      await gravarSessao({ segredo: paraBase64(segredo), ultimoUso: Date.now() });
      segredo.fill(0);
      await atualizarIcone(true);
      enviarDepois();
      return estadoAtual();
    }
    case 'travar':
      await travar();
      return estadoAtual();
    case 'desconectar': {
      const dados = await lerSessao();
      if (dados.token) await cliente.sair(dados.token).catch(() => undefined);
      await chrome.storage.session.clear();
      await chrome.storage.local.remove('arquivo');
      await atualizarIcone(false);
      return estadoAtual();
    }
    case 'sincronizar': {
      await sincronizarAgora(pedido.fator ?? null);
      return estadoAtual();
    }
    case 'contas':
      return comSessao(async (sessao, estado) => {
        const contas = await listarContas(sessao, estado.itens);
        return { todas: contas, doSite: pedido.host ? contasDoHost(contas, pedido.host) : [] };
      });
    case 'preencherAba':
      await enviarParaAba(pedido.abaId, { tipo: 'broquel:preencherId', id: pedido.id });
      return null;
    case 'copiar':
      return comSessao(async (sessao, estado) => {
        const credencial = await credencialDoItem(sessao, estado.itens, pedido.id);
        if (!credencial) throw new Error('Item não encontrado.');
        return pedido.campo === 'senha' ? credencial.senha : credencial.usuario;
      });
    case 'pendenteDaAba':
      return resumoPendente(pedido.abaId);
    case 'decidirPendente':
      await decidir(pedido.abaId, pedido.guardar);
      return null;
    case 'travaMinutos': {
      const minutos = TRAVAS.includes(pedido.minutos) ? pedido.minutos : TRAVA_PADRAO;
      await chrome.storage.local.set({ travaMinutos: minutos });
      return estadoAtual();
    }
    case 'gerar':
      return gerarSenha({ nivel: estadoInicial().nivel, comprimento: estadoInicial().comprimento });
    default:
      throw new Error('Pedido desconhecido.');
  }
}

async function tratarPagina(pedido: Pedido, abaId: number, host: string): Promise<unknown> {
  switch (pedido.tipo) {
    case 'sugestoes': {
      const estado = await lerCofre();
      if (!estado) return { travado: false, contas: [] };
      const dados = await lerSessao();
      if (!dados.segredo || (await expirou(dados))) return { travado: true, contas: [] };
      return comSessao(async (sessao, atual) => {
        const contas = contasDoHost(await listarContas(sessao, atual.itens), host);
        return { travado: false, contas: contas.map((conta) => ({ id: conta.id, titulo: conta.titulo, usuario: conta.usuario })) };
      }, false);
    }
    case 'preencher':
      // Só devolve a senha se o item for deste site ou subdomínio (regra do Android).
      return comSessao(async (sessao, estado) => {
        const credencial = await credencialPara(sessao, estado.itens, pedido.id, host);
        if (!credencial) throw new Error('Esta senha não é deste site.');
        return credencial;
      });
    case 'capturar': {
      if (!pedido.senha || pedido.senha.length > 1024 || pedido.usuario.length > 512) return null;
      if (!(await lerCofre())) return null;
      const { pendentes = {} } = await lerSessao();
      pendentes[String(abaId)] = { host, usuario: pedido.usuario.trim(), senha: pedido.senha, quando: Date.now() };
      await gravarSessao({ pendentes });
      return null;
    }
    case 'pendente':
      return resumoPendente(abaId);
    case 'decidir':
      await decidir(abaId, pedido.guardar);
      return null;
    case 'abrirPopup':
      await abrirPopup();
      return null;
    default:
      throw new Error('Pedido desconhecido.');
  }
}

async function enviarParaAba(abaId: number, ordem: OrdemPagina | { tipo: 'broquel:preencherId'; id: string }): Promise<void> {
  await chrome.tabs.sendMessage(abaId, ordem, { frameId: 0 });
}

async function abrirPopup(): Promise<void> {
  try {
    await chrome.action.openPopup();
  } catch {
    // Navegador sem openPopup: o aviso na página já diz para clicar no ícone.
  }
}

chrome.runtime.onMessage.addListener((pedido: Pedido, remetente, responder: (resposta: Resposta) => void) => {
  tratar(pedido, remetente)
    .then((dados) => responder({ ok: true, dados }))
    .catch((erro: unknown) => responder({ ok: false, erro: mensagem(erro) }));
  return true;
});

// Atalho de teclado: preenche a primeira senha do site aberto.
chrome.commands?.onCommand.addListener((comando) => {
  if (comando !== 'preencher') return;
  void (async () => {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pagina = hostDaPagina(aba?.url);
    if (!aba?.id || !pagina || !paginaConfiavel(pagina)) return;
    try {
      const contas = await comSessao(async (sessao, estado) => contasDoHost(await listarContas(sessao, estado.itens), pagina.host));
      const primeira = contas[0];
      if (primeira) await enviarParaAba(aba.id, { tipo: 'broquel:preencherId', id: primeira.id });
    } catch {
      await abrirPopup();
    }
  })();
});

// Trava por tempo sem uso e quando o computador é bloqueado.
chrome.alarms.create('broquel-trava', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== 'broquel-trava') return;
  void (async () => {
    const dados = await lerSessao();
    if (await expirou(dados)) await travar();
    const { pendentes } = dados;
    if (pendentes) {
      for (const [aba, pendente] of Object.entries(pendentes)) {
        if (Date.now() - pendente.quando > PENDENTE_MS) delete pendentes[aba];
      }
      await gravarSessao({ pendentes });
    }
  })();
});
chrome.idle?.onStateChanged.addListener((estado) => {
  if (estado === 'locked') void travar();
});
chrome.tabs.onRemoved.addListener((abaId) => {
  void esquecerPendente(abaId);
});

// O script das páginas nunca lê a memória da sessão (onde está a chave).
void chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);
void lerSessao().then((dados) => atualizarIcone(Boolean(dados.segredo)));

function mensagem(erro: unknown): string {
  if (erro instanceof Error && erro.message) return erro.message;
  return 'Não foi possível concluir.';
}
