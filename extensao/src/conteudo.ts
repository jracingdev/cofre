/**
 * Script que roda nas páginas (só no quadro de topo). Não tem chave nem lista de senhas:
 * pede ao fundo, que confere o domínio pelo próprio navegador, e só depois de um clique
 * de verdade do usuário (event.isTrusted).
 */
import type { PendenteResumo, PedidoPagina, Resposta } from './mensagens.js';

type Sugestoes = { travado: boolean; contas: Array<{ id: string; titulo: string; usuario: string }> };

const ATRIBUTO = 'data-broquel';

function pedir<T>(pedido: PedidoPagina): Promise<T> {
  return new Promise((resolver, rejeitar) => {
    try {
      chrome.runtime.sendMessage({ ...pedido, origem: 'pagina' }, (resposta: Resposta<T> | undefined) => {
        const erro = chrome.runtime.lastError;
        if (erro || !resposta) return rejeitar(new Error(erro?.message ?? 'Sem resposta do Broquel.'));
        if (!resposta.ok) return rejeitar(new Error(resposta.erro));
        resolver(resposta.dados);
      });
    } catch (erro) {
      // Extensão atualizada ou desligada com a página aberta.
      rejeitar(erro instanceof Error ? erro : new Error('Broquel indisponível.'));
    }
  });
}

// ---------- campos de login ----------

function visivel(campo: HTMLElement): boolean {
  const caixa = campo.getBoundingClientRect();
  if (caixa.width < 2 || caixa.height < 2) return false;
  const estilo = getComputedStyle(campo);
  return estilo.visibility !== 'hidden' && estilo.display !== 'none';
}

function ehSenha(campo: Element): campo is HTMLInputElement {
  return campo instanceof HTMLInputElement && campo.type === 'password' && !campo.disabled;
}

function ehTexto(campo: Element): campo is HTMLInputElement {
  return (
    campo instanceof HTMLInputElement &&
    ['text', 'email', 'tel', ''].includes(campo.type) &&
    !campo.disabled &&
    !campo.readOnly
  );
}

function camposDe(raiz: ParentNode): HTMLInputElement[] {
  return [...raiz.querySelectorAll('input')];
}

function senhasVisiveis(): HTMLInputElement[] {
  return camposDe(document).filter((campo) => ehSenha(campo) && visivel(campo));
}

/** Campo de usuário: dica explícita (autocomplete) ou o texto que vem logo antes da senha. */
function usuarioDe(senha: HTMLInputElement): HTMLInputElement | null {
  const raiz: ParentNode = senha.form ?? document;
  const campos = camposDe(raiz);
  const explicito = campos.find(
    (campo) => ehTexto(campo) && /username|email/u.test(campo.autocomplete) && visivel(campo),
  );
  if (explicito) return explicito;
  const antes = campos.slice(0, campos.indexOf(senha)).filter((campo) => ehTexto(campo) && visivel(campo));
  return antes.at(-1) ?? null;
}

function senhaDoUsuario(usuario: HTMLInputElement): HTMLInputElement | null {
  const raiz: ParentNode = usuario.form ?? document;
  const campos = camposDe(raiz);
  return campos.slice(campos.indexOf(usuario) + 1).find((campo) => ehSenha(campo) && visivel(campo)) ?? null;
}

function escrever(campo: HTMLInputElement, valor: string): void {
  campo.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(campo, valor);
  else campo.value = valor;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  campo.dispatchEvent(new Event('change', { bubbles: true }));
}

async function preencher(id: string, alvo: HTMLInputElement | null): Promise<void> {
  const credencial = await pedir<{ usuario: string; senha: string }>({ tipo: 'preencher', id });
  const senha = alvo && ehSenha(alvo) ? alvo : alvo ? senhaDoUsuario(alvo) : senhasVisiveis()[0] ?? null;
  const usuario = alvo && ehTexto(alvo) ? alvo : senha ? usuarioDe(senha) : null;
  if (usuario && credencial.usuario) escrever(usuario, credencial.usuario);
  if (senha) escrever(senha, credencial.senha);
  credencial.senha = '';
  fecharLista();
}

// ---------- interface (shadow DOM fechado) ----------

const ESTILO = `
  :host { all: initial; }
  .caixa { position: fixed; z-index: 2147483647; font: 14px/1.4 system-ui, sans-serif; color: #e8eef5;
    background: #101820; border: 1px solid #243140; border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.35);
    min-width: 240px; max-width: 360px; overflow: hidden; }
  .topo { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-weight: 600; border-bottom: 1px solid #243140; }
  .escudo { width: 12px; height: 14px; background: #3b6bff; border-radius: 2px 2px 7px 7px; }
  button { all: unset; box-sizing: border-box; display: block; width: 100%; padding: 8px 12px; cursor: pointer; }
  button:hover, button:focus-visible { background: #1d4ed8; }
  .mudo { color: #9aabbc; font-size: 12px; }
  .barra { top: 12px; right: 12px; padding: 12px; }
  .barra p { margin: 0 0 10px; }
  .barra .topo { padding: 0 0 8px; margin-bottom: 8px; }
  .acoes { display: flex; gap: 8px; justify-content: flex-end; }
  .acoes button { width: auto; border-radius: 8px; padding: 6px 12px; border: 1px solid #243140; }
  .acoes .principal { background: #1d4ed8; border-color: #1d4ed8; }
`;

let hospedeiro: HTMLElement | null = null;
let sombra: ShadowRoot | null = null;
let lista: HTMLElement | null = null;
let barra: HTMLElement | null = null;

function raizUi(): ShadowRoot {
  if (sombra && hospedeiro?.isConnected) return sombra;
  hospedeiro = document.createElement('broquel-ui');
  hospedeiro.setAttribute(ATRIBUTO, '');
  sombra = hospedeiro.attachShadow({ mode: 'closed' });
  const estilo = document.createElement('style');
  estilo.textContent = ESTILO;
  sombra.append(estilo);
  document.documentElement.append(hospedeiro);
  return sombra;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe = '', texto = ''): HTMLElementTagNameMap[K] {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto) novo.textContent = texto;
  return novo;
}

function topo(texto: string): HTMLElement {
  // Sem imagem da extensão: recurso acessível pela página deixaria qualquer site detectar o Broquel.
  const linha = el('div', 'topo');
  linha.append(el('span', 'escudo'), document.createTextNode(texto));
  return linha;
}

/** Só aceita cliques de verdade: um script da página não consegue disparar o preenchimento. */
function aoClicar(botao: HTMLElement, acao: () => void): void {
  botao.addEventListener('click', (evento) => {
    evento.preventDefault();
    evento.stopPropagation();
    if (!evento.isTrusted) return;
    acao();
  });
  botao.addEventListener('mousedown', (evento) => evento.preventDefault());
}

function fecharLista(): void {
  lista?.remove();
  lista = null;
}

function mostrarLista(campo: HTMLInputElement, dados: Sugestoes): void {
  fecharLista();
  if (!dados.travado && dados.contas.length === 0) return;
  const raiz = raizUi();
  const caixa = el('div', 'caixa');
  const pos = campo.getBoundingClientRect();
  caixa.style.left = `${Math.max(4, Math.min(pos.left, innerWidth - 260))}px`;
  caixa.style.top = `${Math.min(pos.bottom + 4, innerHeight - 60)}px`;
  caixa.append(topo('Broquel'));
  if (dados.travado) {
    const botao = el('button', '', 'Destravar o Broquel');
    aoClicar(botao, () => {
      fecharLista();
      void pedir({ tipo: 'abrirPopup' }).catch(() => undefined);
    });
    caixa.append(botao);
  }
  for (const conta of dados.contas.slice(0, 8)) {
    const botao = el('button');
    botao.append(el('div', '', conta.usuario || conta.titulo), el('div', 'mudo', conta.titulo));
    aoClicar(botao, () => {
      void preencher(conta.id, campo).catch(() => fecharLista());
    });
    caixa.append(botao);
  }
  raiz.append(caixa);
  lista = caixa;
}

let cache: { quando: number; dados: Sugestoes } | null = null;

async function sugerir(campo: HTMLInputElement): Promise<void> {
  if (!cache || Date.now() - cache.quando > 20_000) {
    cache = { quando: Date.now(), dados: await pedir<Sugestoes>({ tipo: 'sugestoes' }) };
  }
  if (document.activeElement === campo) mostrarLista(campo, cache.dados);
}

document.addEventListener(
  'focusin',
  (evento) => {
    const campo = evento.target;
    if (!(campo instanceof HTMLInputElement) || !visivel(campo)) return;
    const ehLogin = ehSenha(campo) || (ehTexto(campo) && senhaDoUsuario(campo) !== null);
    if (!ehLogin) return;
    void sugerir(campo).catch(() => undefined);
  },
  true,
);

document.addEventListener(
  'pointerdown',
  (evento) => {
    if (lista && !(evento.composedPath() as EventTarget[]).includes(hospedeiro as EventTarget)) fecharLista();
  },
  true,
);
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') fecharLista();
});
// Quem começou a digitar não quer a lista por cima do botão de entrar.
document.addEventListener('input', () => fecharLista(), true);

// ---------- guardar senha nova ----------

let ultimaCaptura = '';

/** Em formulário de troca de senha (atual, nova, confirmação) fica a nova. */
function senhaDigitada(raiz: ParentNode): HTMLInputElement | null {
  const preenchidas = camposDe(raiz).filter((campo) => ehSenha(campo) && campo.value);
  if (preenchidas.length === 0) return null;
  if (preenchidas.length === 1) return preenchidas[0]!;
  const ultima = preenchidas.at(-1)!;
  const penultima = preenchidas.at(-2)!;
  return ultima.value === penultima.value ? ultima : preenchidas[1]!;
}

function capturar(raiz: ParentNode): void {
  const senha = senhaDigitada(raiz);
  if (!senha) return;
  const usuario = usuarioDe(senha)?.value.trim() ?? '';
  const marca = `${usuario}\u0000${senha.value}`;
  if (marca === ultimaCaptura) return;
  ultimaCaptura = marca;
  void pedir({ tipo: 'capturar', usuario, senha: senha.value })
    .then(() => {
      // Página que entra sem recarregar (SPA): pergunta aqui mesmo.
      window.setTimeout(() => void verPendente(), 1500);
    })
    .catch(() => undefined);
}

document.addEventListener(
  'submit',
  (evento) => {
    if (evento.isTrusted && evento.target instanceof HTMLFormElement) capturar(evento.target);
  },
  true,
);

document.addEventListener(
  'click',
  (evento) => {
    if (!evento.isTrusted) return;
    const alvo = (evento.target as Element | null)?.closest?.('button, input[type="submit"], input[type="button"], [role="button"]');
    if (!alvo) return;
    const form = (alvo as HTMLButtonElement).form ?? alvo.closest('form');
    capturar(form ?? document);
  },
  true,
);

document.addEventListener(
  'keydown',
  (evento) => {
    if (!evento.isTrusted || evento.key !== 'Enter') return;
    const campo = evento.target;
    if (campo instanceof HTMLInputElement && (ehSenha(campo) || ehTexto(campo))) capturar(campo.form ?? document);
  },
  true,
);

function fecharBarra(): void {
  barra?.remove();
  barra = null;
}

async function verPendente(): Promise<void> {
  const pendente = await pedir<PendenteResumo | null>({ tipo: 'pendente' });
  if (!pendente) return;
  mostrarBarra(pendente);
}

function mostrarBarra(pendente: PendenteResumo): void {
  fecharBarra();
  const raiz = raizUi();
  const caixa = el('div', 'caixa barra');
  caixa.setAttribute('role', 'dialog');
  caixa.append(topo('Broquel'));
  const quem = pendente.usuario ? `${pendente.usuario} em ${pendente.host}` : pendente.host;
  const texto =
    pendente.tipo === 'atualizar'
      ? `Trocar a senha guardada de ${quem}?`
      : pendente.tipo === 'travado'
        ? `Guardar a senha de ${quem}? Destrave o Broquel para guardar.`
        : `Guardar a senha de ${quem} no Broquel?`;
  caixa.append(el('p', '', texto));
  const acoes = el('div', 'acoes');
  const nao = el('button', '', 'Agora não');
  aoClicar(nao, () => {
    fecharBarra();
    void pedir({ tipo: 'decidir', guardar: false }).catch(() => undefined);
  });
  const sim = el('button', 'principal', pendente.tipo === 'travado' ? 'Destravar' : pendente.tipo === 'atualizar' ? 'Trocar' : 'Guardar');
  aoClicar(sim, () => {
    if (pendente.tipo === 'travado') {
      fecharBarra();
      void pedir({ tipo: 'abrirPopup' }).catch(() => undefined);
      return;
    }
    fecharBarra();
    void pedir({ tipo: 'decidir', guardar: true }).catch(() => undefined);
  });
  acoes.append(nao, sim);
  caixa.append(acoes);
  raiz.append(caixa);
  barra = caixa;
}

// ---------- ordens do fundo (popup ou atalho de teclado) ----------

chrome.runtime.onMessage.addListener((ordem: { tipo?: string; id?: string }, remetente) => {
  if (remetente.id !== chrome.runtime.id || remetente.tab) return;
  if (ordem.tipo === 'broquel:preencherId' && typeof ordem.id === 'string') {
    const focado = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
    void preencher(ordem.id, focado && (ehSenha(focado) || ehTexto(focado)) ? focado : null).catch(() => undefined);
  }
  if (ordem.tipo === 'broquel:mostrarPendente') void verPendente().catch(() => undefined);
});

// Ao carregar a página seguinte ao login, pergunta se quer guardar.
window.setTimeout(() => void verPendente().catch(() => undefined), 600);
