import { controles, entropiaMinimaBits, type EstadoControles } from '@broquel/cripto';
import { abreviarIdentificador, type ConteudoLogin } from './item.js';

export type TelaNome =
  | 'carregando'
  | 'inicio'
  | 'criar'
  | 'kit'
  | 'nova-senha'
  | 'abrir'
  | 'lista'
  | 'editor'
  | 'gerador'
  | 'ajustes'
  | 'sair'
  | 'segundo';

export type Linha = { id: string; titulo: string; usuario: string; conflito: boolean };

export type Vista = {
  tela: TelaNome;
  erro: string;
  aviso: string;
  ocupado: boolean;
  identificador: string;
  kit: string;
  linhas: Linha[];
  gerador: EstadoControles;
  senhaGerada: string;
  bloqueioSegundos: number;
  metodos: string[];
  segredoTotp: string;
  uriTotp: string;
  codigos: string[];
  sessoes: Array<{ id: string; nome: string | null; revogada: boolean }>;
  nome: string;
  apelido: string;
  /** O Sair não alcançou o servidor: a tela oferece apagar só daqui. */
  saidaSemServidor: boolean;
  /** Resumo do plano do cofre no servidor, vazio enquanto não sincronizou. */
  plano: string;
  /** O cofre ainda não foi registrado no servidor: a tela pede o convite. */
  pedeConvite: boolean;
};

export type Acoes = {
  criar(): void;
  abrirOutro(): void;
  confirmarCriacao(): void;
  anoteiKit(): void;
  abrir(): void;
  abrirComKit(): void;
  definirSenhaNova(): void;
  novo(): void;
  editar(id: string): void;
  salvar(): void;
  apagar(): void;
  copiar(texto: string): void;
  gerar(): void;
  gerarNoEditor(): void;
  usarGerada(): void;
  nivel(valor: number): void;
  comprimento(valor: number): void;
  sincronizar(): void;
  travar(): void;
  sair(sincronizarAntes: boolean): void;
  sairSoDaqui(): void;
  ir(tela: TelaNome): void;
  concluirFator(tipo: 'totp' | 'recuperacao' | 'webauthn'): void;
  iniciarTotp(): void;
  confirmarTotp(): void;
  registrarChave(): void;
  girarKit(): void;
  trocarSenha(): void;
  revogar(id: string): void;
  bloqueio(segundos: number): void;
  gravarNome(): void;
  gravarApelido(): void;
  ligarConta(): void;
  guardarConvite(): void;
};

export type Rascunho = {
  senha: string;
  confirmacao: string;
  identificador: string;
  kit: string;
  editor: ConteudoLogin;
  codigo: string;
  senhaNova: string;
  nome: string;
  apelido: string;
  convite: string;
  email: string;
};

export function desenhar(raiz: HTMLElement, vista: Vista, rascunho: Rascunho, acoes: Acoes): void {
  raiz.replaceChildren();
  const moldura = el('main', 'moldura');
  const marca = el('div', 'marca');
  const icone = document.createElement('img');
  icone.src = 'logo.png';
  icone.alt = 'Broquel';
  icone.width = 52;
  icone.height = 52;
  const titulo = document.createElement('h1');
  titulo.textContent = tituloVisivel(vista);
  marca.append(icone, titulo);
  moldura.append(marca);
  if (vista.ocupado) moldura.append(paragrafo('Derivando ou falando com o servidor…', 'mudo'));
  if (vista.erro) moldura.append(paragrafo(vista.erro, 'erro'));
  if (vista.aviso) moldura.append(paragrafo(vista.aviso, 'ok'));
  moldura.append(corpo(vista, rascunho, acoes));
  raiz.append(moldura);
}

function corpo(vista: Vista, rascunho: Rascunho, acoes: Acoes): HTMLElement {
  switch (vista.tela) {
    case 'carregando':
      return paragrafo('Abrindo a cópia local…', 'mudo');
    case 'inicio':
      return inicio(vista, rascunho, acoes);
    case 'criar':
      return criar(rascunho, acoes);
    case 'kit':
      return kit(vista, acoes);
    case 'nova-senha':
      return novaSenha(rascunho, acoes);
    case 'abrir':
      return abrir(vista, rascunho, acoes);
    case 'lista':
      return lista(vista, acoes);
    case 'editor':
      return editor(rascunho, acoes);
    case 'gerador':
      return gerador(vista, acoes);
    case 'ajustes':
      return ajustes(vista, rascunho, acoes);
    case 'sair':
      return confirmarSaida(vista, rascunho, acoes);
    case 'segundo':
      return segundo(vista, rascunho, acoes);
    default:
      return paragrafo('Tela desconhecida.', 'erro');
  }
}

function inicio(vista: Vista, rascunho: Rascunho, acoes: Acoes): HTMLElement {
  const bloco = el('section', 'pilha');
  bloco.append(
    paragrafo('Crie um cofre neste navegador ou abra um que já exista no servidor. A senha mestra não sai daqui.', ''),
    botao('Criar cofre', acoes.criar, vista.ocupado),
    campo('Identificador do cofre', 'text', rascunho.identificador, (valor) => { rascunho.identificador = valor; }),
    botao('Abrir cofre existente', acoes.abrirOutro, vista.ocupado),
  );
  return bloco;
}

function criar(rascunho: Rascunho, acoes: Acoes): HTMLElement {
  const bloco = el('section', 'pilha');
  bloco.append(
    paragrafo('No mínimo 12 caracteres. A derivação usa Argon2id forte e pode travar esta aba por alguns segundos.', 'mudo'),
    campo('Senha mestra', 'password', rascunho.senha, (valor) => { rascunho.senha = valor; }),
    campo('Repita a senha', 'password', rascunho.confirmacao, (valor) => { rascunho.confirmacao = valor; }, acoes.confirmarCriacao),
    campo('Código de convite', 'text', rascunho.convite, (valor) => { rascunho.convite = valor; }),
    paragrafo('Durante o período de testes, o servidor só aceita cofre novo com convite.', 'mudo'),
    botao('Criar', acoes.confirmarCriacao, false),
    botao('Voltar', () => acoes.ir('inicio'), false, true),
  );
  return bloco;
}

function kit(vista: Vista, acoes: Acoes): HTMLElement {
  const bloco = el('section', 'pilha');
  const texto = el('p', 'kit');
  texto.textContent = vista.kit;
  bloco.append(
    paragrafo('Anote este kit fora do navegador. Ele abre o cofre se você esquecer a senha. Ele não será mostrado de novo e não fica gravado aqui.', ''),
    texto,
    paragrafo(`Identificador, para o aplicativo: ${vista.identificador}`, 'mudo'),
    botao('Copiar kit', () => acoes.copiar(vista.kit), false),
    botao('Copiar identificador', () => acoes.copiar(vista.identificador), false, true),
    botao('Já anotei', acoes.anoteiKit, false),
  );
  return bloco;
}

function novaSenha(rascunho: Rascunho, acoes: Acoes): HTMLElement {
  const bloco = el('section', 'pilha');
  bloco.append(
    paragrafo('O kit abriu o cofre. Escolha a senha mestra nova. A antiga deixa de valer.', ''),
    campo('Senha nova', 'password', rascunho.senhaNova, (valor) => { rascunho.senhaNova = valor; }),
    campo('Repita a senha', 'password', rascunho.confirmacao, (valor) => { rascunho.confirmacao = valor; }),
    botao('Gravar senha', acoes.definirSenhaNova, false),
  );
  return bloco;
}

function abrir(vista: Vista, rascunho: Rascunho, acoes: Acoes): HTMLElement {
  const bloco = el('section', 'pilha');
  const logo = document.createElement('img');
  logo.src = 'logo.png';
  logo.alt = 'Broquel';
  logo.className = 'logo-abertura';
  bloco.append(
    logo,
    paragrafo(`Cofre ${vista.identificador}`, 'mudo'),
    campo('Senha mestra', 'password', rascunho.senha, (valor) => { rascunho.senha = valor; }, acoes.abrir),
    botao('Abrir', acoes.abrir, vista.ocupado),
    campo('Kit de recuperação', 'text', rascunho.kit, (valor) => { rascunho.kit = valor; }),
    botao('Abrir com o kit', acoes.abrirComKit, vista.ocupado, true),
    botao('Outro cofre', () => acoes.ir('inicio'), false, true),
  );
  return bloco;
}

function lista(vista: Vista, acoes: Acoes): HTMLElement {
  const bloco = el('section', '');
  const acoesLinha = el('div', 'acoes');
  acoesLinha.append(
    botao('Novo item', acoes.novo, false),
    botao('Gerador', () => acoes.ir('gerador'), false, true),
    botao('Sincronizar', acoes.sincronizar, vista.ocupado, true),
    botao('Ajustes', () => acoes.ir('ajustes'), false, true),
    botao('Travar', acoes.travar, false, true),
    botao('Sair', () => acoes.ir('sair'), false, true),
  );
  const itens = el('div', 'lista');
  if (vista.linhas.length === 0) itens.append(paragrafo('Nenhum item ainda. Use Novo item para guardar a primeira senha.', 'mudo'));
  const ordenadas = [...vista.linhas].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { sensitivity: 'base' }));
  for (const linha of ordenadas) {
    const botaoItem = document.createElement('button');
    botaoItem.className = 'item';
    botaoItem.type = 'button';
    botaoItem.addEventListener('click', () => acoes.editar(linha.id));
    const nome = document.createElement('strong');
    nome.textContent = linha.titulo + (linha.conflito ? ' (conflito)' : '');
    const usuario = document.createElement('div');
    usuario.className = 'mudo';
    usuario.textContent = linha.usuario;
    botaoItem.append(nome, usuario);
    botaoItem.dataset.busca = `${linha.titulo} ${linha.usuario}`.toLocaleLowerCase('pt-BR');
    itens.append(botaoItem);
  }
  bloco.append(acoesLinha);
  if (vista.linhas.length > 5) bloco.append(busca(itens));
  bloco.append(itens);
  return bloco;
}

function editor(rascunho: Rascunho, acoes: Acoes): HTMLElement {
  const editorAtual = rascunho.editor;
  const bloco = el('section', 'pilha');
  bloco.append(
    campo('Título', 'text', editorAtual.titulo, (valor) => { editorAtual.titulo = valor; }),
    campo('Usuário', 'text', editorAtual.usuario, (valor) => { editorAtual.usuario = valor; }),
    campoSenha('Senha', editorAtual.senha, (valor) => { editorAtual.senha = valor; }),
    botao('Gerar senha forte', acoes.gerarNoEditor, false, true),
    campo('Site', 'url', editorAtual.url, (valor) => { editorAtual.url = valor; }),
    area('Notas', editorAtual.notas, (valor) => { editorAtual.notas = valor; }),
  );
  const linha = el('div', 'acoes');
  linha.append(
    botao('Salvar', acoes.salvar, false),
    botao('Copiar usuário', () => acoes.copiar(editorAtual.usuario), false, true),
    botao('Copiar senha', () => acoes.copiar(editorAtual.senha), false, true),
    botaoConfirmado('Apagar', 'Confirmar: apagar de vez', acoes.apagar),
    botao('Voltar', () => acoes.ir('lista'), false, true),
  );
  bloco.append(linha);
  return bloco;
}

function gerador(vista: Vista, acoes: Acoes): HTMLElement {
  const [nivel, comprimento] = controles(vista.gerador);
  const bloco = el('section', 'pilha');
  bloco.append(paragrafo(`${nivel.rotulo}: ${nivel.marcas.find((marca) => marca.valor === nivel.valor)?.rotulo ?? ''}`, ''));
  bloco.append(controle(nivel.minimo, nivel.maximo, nivel.passo, nivel.valor, acoes.nivel));
  bloco.append(paragrafo(`${comprimento.rotulo}: ${comprimento.valor} · cerca de ${entropiaMinimaBits(vista.gerador)} bits`, ''));
  bloco.append(controle(comprimento.minimo, comprimento.maximo, comprimento.passo, comprimento.valor, acoes.comprimento));
  bloco.append(botao('Gerar', acoes.gerar, false));
  if (vista.senhaGerada) {
    const texto = el('p', 'kit');
    texto.textContent = vista.senhaGerada;
    bloco.append(texto, botao('Copiar', () => acoes.copiar(vista.senhaGerada), false, true), botao('Usar num item', acoes.usarGerada, false));
  }
  bloco.append(botao('Voltar', () => acoes.ir('lista'), false, true));
  return bloco;
}

function ajustes(vista: Vista, rascunho: Rascunho, acoes: Acoes): HTMLElement {
  const bloco = el('section', 'pilha');
  bloco.append(paragrafo(`Identificador: ${vista.identificador}`, 'mudo'));
  bloco.append(botao('Copiar identificador', () => acoes.copiar(vista.identificador), false, true));
  bloco.append(campo('Nome do cofre', 'text', rascunho.nome, (valor) => { rascunho.nome = valor; }));
  bloco.append(paragrafo('Esse nome é cifrado com a chave do cofre. O servidor não o vê. Sincronize para o celular mostrar o mesmo nome.', 'mudo'));
  bloco.append(botao('Guardar nome', acoes.gravarNome, vista.ocupado));
  bloco.append(campo('Apelido neste navegador', 'text', rascunho.apelido, (valor) => { rascunho.apelido = valor; }));
  bloco.append(paragrafo('O apelido aparece nesta tela de abrir, antes da senha. Fica gravado neste navegador, sem a cifra do cofre, e não é enviado ao servidor.', 'mudo'));
  bloco.append(botao('Guardar apelido', acoes.gravarApelido, false, true));
  if (vista.pedeConvite) {
    bloco.append(campo('Código de convite', 'text', rascunho.convite, (valor) => { rascunho.convite = valor; }));
    bloco.append(paragrafo('O cofre ainda não está no servidor. Informe o convite e sincronize.', 'mudo'));
    bloco.append(botao('Usar convite', acoes.guardarConvite, vista.ocupado, true));
  }
  if (vista.plano) bloco.append(paragrafo(vista.plano, 'mudo'));
  bloco.append(campo('E-mail da conta', 'email', rascunho.email, (valor) => { rascunho.email = valor; }));
  bloco.append(paragrafo('A conta cuida do plano e da cobrança e não abre o cofre. Enviamos um link para confirmar o e-mail; ao abrir, este cofre fica ligado à conta.', 'mudo'));
  bloco.append(botao('Ligar à conta', acoes.ligarConta, vista.ocupado, true));
  bloco.append(paragrafo(`Bloqueio por inatividade: ${vista.bloqueioSegundos}s`, ''));
  bloco.append(controle(15, 300, 15, vista.bloqueioSegundos, acoes.bloqueio));
  bloco.append(paragrafo('O site fala só com este servidor. Não há script de fora e a chave fica só na memória, enquanto o cofre está aberto.', 'mudo'));
  if (vista.segredoTotp) {
    bloco.append(paragrafo(`Segredo TOTP: ${vista.segredoTotp}`, ''));
    bloco.append(paragrafo(vista.uriTotp, 'kit'));
  }
  bloco.append(campo('Código de 6 dígitos', 'text', rascunho.codigo, (valor) => { rascunho.codigo = valor; }));
  const linha = el('div', 'acoes');
  linha.append(
    botao('Ligar TOTP', acoes.iniciarTotp, vista.ocupado, true),
    botao('Confirmar TOTP', acoes.confirmarTotp, vista.ocupado),
    botao('Cadastrar chave FIDO2', acoes.registrarChave, vista.ocupado, true),
  );
  bloco.append(linha);
  if (vista.codigos.length > 0) {
    bloco.append(paragrafo('Códigos de recuperação, mostrados uma vez. Guarde fora do navegador.', ''));
    for (const codigo of vista.codigos) bloco.append(paragrafo(codigo, 'kit'));
  }
  bloco.append(campo('Senha mestra nova', 'password', rascunho.senhaNova, (valor) => { rascunho.senhaNova = valor; }));
  const extras = el('div', 'acoes');
  extras.append(
    botao('Trocar senha mestra', acoes.trocarSenha, vista.ocupado, true),
    botao('Gerar outro kit', acoes.girarKit, vista.ocupado, true),
  );
  bloco.append(extras);
  for (const sessao of vista.sessoes) {
    const linhaSessao = el('div', 'faixa');
    linhaSessao.append(paragrafo(`${sessao.nome ?? 'aparelho'} ${sessao.revogada ? '(revogada)' : ''}`, 'mudo'));
    if (!sessao.revogada) linhaSessao.append(botao('Revogar', () => acoes.revogar(sessao.id), false, true));
    bloco.append(linhaSessao);
  }
  bloco.append(botao('Voltar', () => acoes.ir('lista'), false, true));
  return bloco;
}

function confirmarSaida(vista: Vista, _rascunho: Rascunho, acoes: Acoes): HTMLElement {
  const bloco = el('section', 'pilha');
  bloco.append(
    paragrafo('Sair encerra a sessão neste navegador e apaga daqui o cabeçalho e os itens cifrados. O cofre no servidor continua.', ''),
    paragrafo('O que ainda não foi sincronizado será perdido. Se puder, sincronize antes.', 'mudo'),
    botao('Sincronizar e sair', () => acoes.sair(true), vista.ocupado),
    botao('Sair sem sincronizar', () => acoes.sair(false), vista.ocupado, true),
  );
  if (vista.saidaSemServidor) {
    bloco.append(botao('Apagar só deste navegador', acoes.sairSoDaqui, vista.ocupado, true));
  }
  bloco.append(botao('Cancelar', () => acoes.ir('lista'), false, true));
  return bloco;
}

function segundo(vista: Vista, rascunho: Rascunho, acoes: Acoes): HTMLElement {
  const bloco = el('section', 'pilha');
  bloco.append(paragrafo('O cofre pede o segundo fator.', ''));
  if (vista.metodos.includes('totp')) {
    bloco.append(campo('Código TOTP', 'text', rascunho.codigo, (valor) => { rascunho.codigo = valor; }, () => acoes.concluirFator('totp'), 'one-time-code'));
    bloco.append(botao('Confirmar código', () => acoes.concluirFator('totp'), vista.ocupado));
  }
  if (vista.metodos.includes('recuperacao')) {
    bloco.append(botao('Usar código de recuperação', () => acoes.concluirFator('recuperacao'), vista.ocupado, true));
  }
  if (vista.metodos.includes('webauthn')) {
    bloco.append(botao('Usar chave FIDO2', () => acoes.concluirFator('webauthn'), vista.ocupado, true));
  }
  return bloco;
}

function controle(minimo: number, maximo: number, passo: number, valor: number, aoMudar: (valor: number) => void): HTMLInputElement {
  const entrada = document.createElement('input');
  entrada.type = 'range';
  entrada.min = String(minimo);
  entrada.max = String(maximo);
  entrada.step = String(passo);
  entrada.value = String(valor);
  entrada.addEventListener('input', () => aoMudar(Number(entrada.value)));
  return entrada;
}

function campo(
  rotulo: string,
  tipo: string,
  valor: string,
  aoMudar: (valor: string) => void,
  aoConfirmar?: () => void,
  completar: AutoFill = 'off',
): HTMLLabelElement {
  const etiqueta = document.createElement('label');
  etiqueta.textContent = rotulo;
  etiqueta.append(entradaDe(tipo, valor, aoMudar, aoConfirmar, completar));
  return etiqueta;
}

function entradaDe(
  tipo: string,
  valor: string,
  aoMudar: (valor: string) => void,
  aoConfirmar?: () => void,
  completar: AutoFill = 'off',
): HTMLInputElement {
  const entrada = document.createElement('input');
  entrada.type = tipo;
  entrada.value = valor;
  entrada.autocomplete = completar;
  entrada.spellcheck = false;
  entrada.autocapitalize = 'off';
  if (completar === 'one-time-code') entrada.inputMode = 'numeric';
  entrada.addEventListener('input', () => aoMudar(entrada.value));
  if (aoConfirmar) {
    entrada.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        aoConfirmar();
      }
    });
  }
  return entrada;
}

/** Senha escondida por padrão, com botão para mostrar. Quem olha a tela não lê sem um clique a mais. */
function campoSenha(rotulo: string, valor: string, aoMudar: (valor: string) => void): HTMLLabelElement {
  const etiqueta = document.createElement('label');
  etiqueta.textContent = rotulo;
  const linha = el('div', 'com-botao');
  const entrada = entradaDe('password', valor, aoMudar);
  const alternar = botao('Mostrar', () => {
    const mostrando = entrada.type === 'text';
    entrada.type = mostrando ? 'password' : 'text';
    alternar.textContent = mostrando ? 'Mostrar' : 'Ocultar';
    alternar.setAttribute('aria-pressed', String(!mostrando));
  }, false, true);
  alternar.setAttribute('aria-pressed', 'false');
  linha.append(entrada, alternar);
  etiqueta.append(linha);
  return etiqueta;
}

/** Busca na lista sem redesenhar a tela, para o campo não perder o foco. */
function busca(itens: HTMLElement): HTMLLabelElement {
  const vazio = paragrafo('', 'mudo');
  vazio.hidden = true;
  itens.append(vazio);
  return campo('Buscar', 'search', '', (valor) => {
    const termo = valor.trim().toLocaleLowerCase('pt-BR');
    let achados = 0;
    for (const item of Array.from(itens.querySelectorAll<HTMLElement>('button.item'))) {
      const mostra = !termo || (item.dataset.busca ?? '').includes(termo);
      item.hidden = !mostra;
      if (mostra) achados += 1;
    }
    vazio.hidden = achados > 0;
    vazio.textContent = `Nada encontrado para "${valor.trim()}".`;
  });
}

/** Ação destrutiva pede um segundo clique, sem caixa de diálogo do navegador. */
function botaoConfirmado(texto: string, confirmar: string, aoConfirmar: () => void): HTMLButtonElement {
  let armado = false;
  const elemento = botao(texto, () => {
    if (!armado) {
      armado = true;
      elemento.textContent = confirmar;
      elemento.className = 'perigo';
      window.setTimeout(() => {
        armado = false;
        elemento.textContent = texto;
        elemento.className = 'secundario';
      }, 5000);
      return;
    }
    aoConfirmar();
  }, false, true);
  return elemento;
}

function area(rotulo: string, valor: string, aoMudar: (valor: string) => void): HTMLLabelElement {
  const etiqueta = document.createElement('label');
  etiqueta.textContent = rotulo;
  const entrada = document.createElement('textarea');
  entrada.value = valor;
  entrada.autocomplete = 'off';
  entrada.spellcheck = false;
  entrada.addEventListener('input', () => aoMudar(entrada.value));
  etiqueta.append(entrada);
  return etiqueta;
}

function botao(texto: string, aoClicar: () => void, desligado: boolean, secundario = false): HTMLButtonElement {
  const botaoEl = document.createElement('button');
  botaoEl.type = 'button';
  botaoEl.textContent = texto;
  botaoEl.disabled = desligado;
  if (secundario) botaoEl.className = 'secundario';
  botaoEl.addEventListener('click', aoClicar);
  return botaoEl;
}

function paragrafo(texto: string, classe: string): HTMLParagraphElement {
  const elemento = document.createElement('p');
  if (classe) elemento.className = classe;
  elemento.textContent = texto;
  return elemento;
}

function tituloVisivel(vista: Vista): string {
  const aberto = vista.tela === 'lista' || vista.tela === 'editor' || vista.tela === 'gerador' || vista.tela === 'ajustes' || vista.tela === 'sair' || vista.tela === 'kit' || vista.tela === 'nova-senha';
  if (aberto && vista.nome) return vista.nome;
  if (aberto && vista.identificador) return abreviarIdentificador(vista.identificador);
  if (vista.tela === 'abrir' && vista.apelido) return vista.apelido;
  if (vista.tela === 'abrir' && vista.identificador) return abreviarIdentificador(vista.identificador);
  return 'Broquel';
}

function el(tag: 'main' | 'div' | 'section' | 'p', classe: string): HTMLElement {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  return elemento;
}
