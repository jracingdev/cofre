/** Janela do ícone do Broquel. Todo texto vai por textContent: nada de HTML vindo de item. */
import { hostDaPagina, paginaConfiavel } from './dominio.js';
import type { ContaResumo, Estado, PendenteResumo, PedidoPopup, Resposta } from './mensagens.js';

const raiz = document.querySelector<HTMLElement>('#aplicacao')!;

let estado: Estado | null = null;
let aba: { id: number; host: string | null } = { id: -1, host: null };
let erro = '';
let aviso = '';
let ocupado = false;
let busca = '';
let mostrarAjustes = false;
let senhaGerada = '';

function pedir<T>(pedido: PedidoPopup): Promise<T> {
  return new Promise((resolver, rejeitar) => {
    chrome.runtime.sendMessage({ ...pedido, origem: 'popup' }, (resposta: Resposta<T> | undefined) => {
      const falha = chrome.runtime.lastError;
      if (falha || !resposta) return rejeitar(new Error(falha?.message ?? 'Sem resposta do Broquel.'));
      if (!resposta.ok) return rejeitar(new Error(resposta.erro));
      resolver(resposta.dados);
    });
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...filhos: Array<Node | string>): HTMLElementTagNameMap[K] {
  const novo = document.createElement(tag);
  Object.assign(novo, props);
  novo.append(...filhos);
  return novo;
}

async function acao(tarefa: () => Promise<void>): Promise<void> {
  ocupado = true;
  erro = '';
  void desenhar();
  try {
    await tarefa();
  } catch (falha) {
    erro = falha instanceof Error ? falha.message : 'Não foi possível concluir.';
  }
  ocupado = false;
  await desenhar();
}

async function copiar(texto: string, rotulo: string): Promise<void> {
  await navigator.clipboard.writeText(texto);
  aviso = `${rotulo} copiado.`;
}

function marca(): HTMLElement {
  const nome = estado?.nome || (estado?.identificador ? `${estado.identificador.slice(0, 8)}…` : '');
  return el(
    'div',
    { className: 'marca' },
    el('img', { src: 'icones/48.png', alt: '' }),
    el('strong', { textContent: 'Broquel' }),
    el('span', { className: 'mudo', textContent: nome }),
  );
}

function campo(rotulo: string, props: Partial<HTMLInputElement>): { rotulo: HTMLLabelElement; entrada: HTMLInputElement } {
  const entrada = el('input', props);
  entrada.id = `c-${Math.random().toString(36).slice(2)}`;
  const etiqueta = el('label', { textContent: rotulo, htmlFor: entrada.id });
  return { rotulo: etiqueta, entrada };
}

function mensagens(): Node[] {
  const lista: Node[] = [];
  if (erro) lista.push(el('p', { className: 'erro', textContent: erro, role: 'alert' } as Partial<HTMLParagraphElement>));
  if (aviso) lista.push(el('p', { className: 'aviso', textContent: aviso }));
  return lista;
}

function telaConectar(): Node[] {
  const id = campo('Identificador do cofre', { autocomplete: 'off', spellcheck: false, placeholder: '32 caracteres' });
  const senha = campo('Senha mestra', { type: 'password', autocomplete: 'current-password' });
  const botao = el('button', { className: 'principal', type: 'submit', textContent: 'Conectar', disabled: ocupado });
  const form = el('form', {}, id.rotulo, id.entrada, senha.rotulo, senha.entrada, botao);
  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const pedido = { tipo: 'conectar' as const, identificador: id.entrada.value, senha: senha.entrada.value };
    senha.entrada.value = '';
    void acao(async () => {
      estado = await pedir<Estado>(pedido);
    });
  });
  queueMicrotask(() => id.entrada.focus());
  return [
    el('p', { textContent: 'Conecte o seu cofre. O identificador está em Ajustes, no app ou no site do Broquel.' }),
    form,
    el('p', { className: 'mudo', textContent: 'A senha mestra não sai deste navegador. O servidor guarda só dados cifrados.' }),
  ];
}

function telaTravado(): Node[] {
  const senha = campo('Senha mestra', { type: 'password', autocomplete: 'current-password' });
  const botao = el('button', { className: 'principal', type: 'submit', textContent: ocupado ? 'Abrindo…' : 'Destravar', disabled: ocupado });
  const form = el('form', {}, senha.rotulo, senha.entrada, botao);
  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const valor = senha.entrada.value;
    senha.entrada.value = '';
    void acao(async () => {
      estado = await pedir<Estado>({ tipo: 'destravar', senha: valor });
    });
  });
  queueMicrotask(() => senha.entrada.focus());
  const sair = el('button', { className: 'link', type: 'button', textContent: 'Desconectar este cofre' });
  sair.addEventListener('click', () => confirmarDesconectar());
  return [form, el('p', { className: 'mudo' }, sair)];
}

let confirmandoSaida = false;

/** Dois cliques: o Firefox não mostra confirm() no popup. */
function confirmarDesconectar(): void {
  if (!confirmandoSaida) {
    confirmandoSaida = true;
    aviso = '';
    erro = 'Clique de novo para apagar a cópia do cofre desta extensão. As senhas continuam no servidor e nos outros aparelhos.';
    void desenhar();
    return;
  }
  confirmandoSaida = false;
  void acao(async () => {
    estado = await pedir<Estado>({ tipo: 'desconectar' });
  });
}

function blocoFator(): Node[] {
  if (!estado || estado.precisaFator.length === 0) return [];
  const metodos = estado.precisaFator.filter((metodo) => metodo === 'totp' || metodo === 'recuperacao');
  if (metodos.length === 0) {
    return [el('div', { className: 'cartao', textContent: 'Este cofre pede chave FIDO2, que a extensão não usa. Sincronize pelo app ou pelo site.' })];
  }
  const tipo = el('select', {}, ...metodos.map((metodo) => el('option', { value: metodo, textContent: metodo === 'totp' ? 'Código do autenticador' : 'Código de recuperação' })));
  const codigo = campo('Código', { autocomplete: 'one-time-code', inputMode: 'numeric' });
  const botao = el('button', { className: 'principal', type: 'submit', textContent: 'Sincronizar', disabled: ocupado });
  const form = el('form', { className: 'cartao' }, el('div', { textContent: 'O servidor pede o segundo fator para sincronizar.' }), tipo, codigo.rotulo, codigo.entrada, botao);
  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const fator = { tipo: tipo.value as 'totp' | 'recuperacao', codigo: codigo.entrada.value.trim() };
    void acao(async () => {
      estado = await pedir<Estado>({ tipo: 'sincronizar', fator });
      aviso = 'Sincronizado.';
    });
  });
  return [form];
}

function blocoPendente(pendente: PendenteResumo | null): Node[] {
  if (!pendente || pendente.tipo === 'travado') return [];
  const quem = pendente.usuario ? `${pendente.usuario} em ${pendente.host}` : pendente.host;
  const texto = pendente.tipo === 'atualizar' ? `Trocar a senha guardada de ${quem}?` : `Guardar a senha de ${quem}?`;
  const nao = el('button', { type: 'button', textContent: 'Agora não' });
  const sim = el('button', { type: 'button', textContent: pendente.tipo === 'atualizar' ? 'Trocar' : 'Guardar' });
  nao.addEventListener('click', () => void acao(async () => { await pedir({ tipo: 'decidirPendente', abaId: aba.id, guardar: false }); }));
  sim.addEventListener('click', () => void acao(async () => {
    await pedir({ tipo: 'decidirPendente', abaId: aba.id, guardar: true });
    aviso = 'Senha guardada.';
  }));
  return [el('div', { className: 'cartao' }, el('div', { textContent: texto }), el('div', { className: 'rodape' }, nao, sim))];
}

function linhaConta(conta: ContaResumo, preencher: boolean): HTMLElement {
  const botoes: HTMLElement[] = [];
  if (preencher) {
    const usar = el('button', { type: 'button', textContent: 'Preencher' });
    usar.addEventListener('click', () => void acao(async () => {
      await pedir({ tipo: 'preencherAba', abaId: aba.id, id: conta.id });
      window.close();
    }));
    botoes.push(usar);
  }
  const copiaUsuario = el('button', { type: 'button', textContent: 'Usuário', title: 'Copiar usuário' });
  copiaUsuario.addEventListener('click', () => void acao(async () => copiar(await pedir<string>({ tipo: 'copiar', id: conta.id, campo: 'usuario' }), 'Usuário')));
  const copiaSenha = el('button', { type: 'button', textContent: 'Senha', title: 'Copiar senha' });
  copiaSenha.addEventListener('click', () => void acao(async () => copiar(await pedir<string>({ tipo: 'copiar', id: conta.id, campo: 'senha' }), 'Senha')));
  botoes.push(copiaUsuario, copiaSenha);
  return el(
    'div',
    { className: 'conta' },
    el('div', { className: 'texto' }, el('div', { textContent: conta.titulo }), el('div', { className: 'mudo', textContent: conta.usuario })),
    ...botoes,
  );
}

async function telaAberto(): Promise<Node[]> {
  const nos: Node[] = [];
  nos.push(...blocoFator());
  const pendente = aba.id >= 0 ? await pedir<PendenteResumo | null>({ tipo: 'pendenteDaAba', abaId: aba.id }).catch(() => null) : null;
  nos.push(...blocoPendente(pendente));
  const { todas, doSite } = await pedir<{ todas: ContaResumo[]; doSite: ContaResumo[] }>({ tipo: 'contas', host: aba.host });
  if (aba.host) {
    nos.push(el('h2', { textContent: `Neste site · ${aba.host.replace(/^www\./u, '')}` }));
    nos.push(
      doSite.length
        ? el('div', { className: 'lista' }, ...doSite.map((conta) => linhaConta(conta, true)))
        : el('p', { className: 'mudo', textContent: 'Nenhuma senha guardada para este site. Ao entrar com uma senha nova, o Broquel pergunta se quer guardar.' }),
    );
  }
  const filtro = campo('Buscar no cofre', { type: 'search', value: busca, autocomplete: 'off', placeholder: 'Buscar no cofre' });
  filtro.entrada.setAttribute('aria-label', 'Buscar no cofre');
  const resultado = el('div', { className: 'lista' });
  const filtrar = (): void => {
    busca = filtro.entrada.value;
    const termo = busca.trim().toLowerCase();
    const achadas = termo
      ? todas.filter((conta) => `${conta.titulo} ${conta.usuario} ${conta.url}`.toLowerCase().includes(termo)).slice(0, 30)
      : [];
    resultado.replaceChildren(...achadas.map((conta) => linhaConta(conta, false)));
  };
  filtro.entrada.addEventListener('input', filtrar);
  filtrar();
  nos.push(el('h2', { textContent: `Cofre · ${todas.length} ${todas.length === 1 ? 'senha' : 'senhas'}` }), filtro.entrada, resultado);

  if (senhaGerada) {
    const copia = el('button', { type: 'button', textContent: 'Copiar' });
    copia.addEventListener('click', () => void acao(async () => copiar(senhaGerada, 'Senha gerada')));
    nos.push(el('div', { className: 'cartao' }, el('div', { className: 'gerada', textContent: senhaGerada }), el('div', { className: 'rodape' }, copia)));
  }

  const sincronizar = el('button', { type: 'button', textContent: 'Sincronizar', disabled: ocupado });
  sincronizar.addEventListener('click', () => void acao(async () => {
    estado = await pedir<Estado>({ tipo: 'sincronizar' });
    aviso = estado.precisaFator.length ? '' : estado.avisoSync || 'Sincronizado.';
  }));
  const gerar = el('button', { type: 'button', textContent: 'Gerar senha' });
  gerar.addEventListener('click', () => void acao(async () => { senhaGerada = await pedir<string>({ tipo: 'gerar' }); }));
  const travar = el('button', { type: 'button', textContent: 'Travar' });
  travar.addEventListener('click', () => void acao(async () => { estado = await pedir<Estado>({ tipo: 'travar' }); }));
  const ajustes = el('button', { type: 'button', textContent: 'Ajustes' });
  ajustes.addEventListener('click', () => { mostrarAjustes = !mostrarAjustes; void desenhar(); });
  nos.push(el('div', { className: 'rodape' }, sincronizar, gerar, travar, ajustes));

  const situacao = estado!.pendentesEnvio
    ? `${estado!.pendentesEnvio} alteração(ões) esperando envio ao servidor.`
    : estado!.ultimaSync
      ? `Sincronizado às ${new Date(estado!.ultimaSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
      : '';
  if (situacao) nos.push(el('p', { className: 'mudo', textContent: situacao }));

  if (mostrarAjustes) nos.push(...blocoAjustes());
  return nos;
}

function blocoAjustes(): Node[] {
  const trava = el(
    'select',
    {},
    ...[5, 15, 60].map((minutos) => el('option', { value: String(minutos), textContent: `${minutos} minutos sem uso`, selected: estado?.travaMinutos === minutos })),
  );
  trava.addEventListener('change', () => void acao(async () => {
    estado = await pedir<Estado>({ tipo: 'travaMinutos', minutos: Number(trava.value) });
    aviso = 'Tempo de trava guardado.';
  }));
  const sair = el('button', { type: 'button', textContent: 'Desconectar este cofre' });
  sair.addEventListener('click', () => confirmarDesconectar());
  return [
    el(
      'div',
      { className: 'cartao' },
      el('label', { textContent: 'Travar depois de' }),
      trava,
      el('p', { className: 'mudo', textContent: 'O Broquel também trava ao bloquear o computador e ao fechar o navegador.' }),
      el('p', { className: 'mudo', textContent: `Identificador: ${estado?.identificador ?? ''}` }),
      sair,
    ),
  ];
}

async function desenhar(): Promise<void> {
  const nos: Node[] = [marca()];
  try {
    if (!estado) nos.push(el('p', { className: 'mudo', textContent: 'Carregando…' }));
    else if (!estado.configurado) nos.push(...telaConectar());
    else if (!estado.aberto) nos.push(...telaTravado());
    else nos.push(...(await telaAberto()));
  } catch (falha) {
    erro = falha instanceof Error ? falha.message : 'Não foi possível concluir.';
    if (/travado/u.test(erro)) {
      estado = await pedir<Estado>({ tipo: 'estado' });
      erro = '';
      return desenhar();
    }
  }
  nos.push(...mensagens());
  raiz.replaceChildren(...nos);
}

async function iniciar(): Promise<void> {
  const [ativa] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pagina = hostDaPagina(ativa?.url);
  aba = { id: ativa?.id ?? -1, host: pagina && paginaConfiavel(pagina) ? pagina.host : null };
  try {
    estado = await pedir<Estado>({ tipo: 'estado' });
  } catch (falha) {
    erro = falha instanceof Error ? falha.message : 'Broquel indisponível.';
  }
  await desenhar();
}

void iniciar();
