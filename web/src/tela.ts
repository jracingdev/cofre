import { controles, entropiaMinimaBits, type EstadoControles } from '@broquel/cripto';
import type { ConteudoLogin } from './item.js';

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
  usarGerada(): void;
  nivel(valor: number): void;
  comprimento(valor: number): void;
  sincronizar(): void;
  travar(): void;
  ir(tela: TelaNome): void;
  concluirFator(tipo: 'totp' | 'recuperacao' | 'webauthn'): void;
  iniciarTotp(): void;
  confirmarTotp(): void;
  registrarChave(): void;
  girarKit(): void;
  trocarSenha(): void;
  revogar(id: string): void;
  bloqueio(segundos: number): void;
};

export type Rascunho = {
  senha: string;
  confirmacao: string;
  identificador: string;
  kit: string;
  editor: ConteudoLogin;
  codigo: string;
  senhaNova: string;
};

export function desenhar(raiz: HTMLElement, vista: Vista, rascunho: Rascunho, acoes: Acoes): void {
  raiz.replaceChildren();
  const moldura = el('main', 'moldura');
  const marca = el('div', 'marca');
  const icone = document.createElement('img');
  icone.src = 'escudo.svg';
  icone.alt = 'Broquel';
  icone.width = 52;
  icone.height = 52;
  const titulo = document.createElement('h1');
  titulo.textContent = 'Broquel';
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
    campo('Repita a senha', 'password', rascunho.confirmacao, (valor) => { rascunho.confirmacao = valor; }),
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
  bloco.append(
    paragrafo(`Cofre ${vista.identificador}`, 'mudo'),
    campo('Senha mestra', 'password', rascunho.senha, (valor) => { rascunho.senha = valor; }),
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
  );
  const itens = el('div', 'lista');
  if (vista.linhas.length === 0) itens.append(paragrafo('Nenhum item. O que foi apagado continua no servidor só como marca, sem o conteúdo.', 'mudo'));
  for (const linha of vista.linhas) {
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
    itens.append(botaoItem);
  }
  bloco.append(acoesLinha, itens);
  return bloco;
}

function editor(rascunho: Rascunho, acoes: Acoes): HTMLElement {
  const editorAtual = rascunho.editor;
  const bloco = el('section', 'pilha');
  bloco.append(
    campo('Título', 'text', editorAtual.titulo, (valor) => { editorAtual.titulo = valor; }),
    campo('Usuário', 'text', editorAtual.usuario, (valor) => { editorAtual.usuario = valor; }),
    campo('Senha', 'text', editorAtual.senha, (valor) => { editorAtual.senha = valor; }),
    campo('Site', 'text', editorAtual.url, (valor) => { editorAtual.url = valor; }),
    area('Notas', editorAtual.notas, (valor) => { editorAtual.notas = valor; }),
  );
  const linha = el('div', 'acoes');
  linha.append(
    botao('Salvar', acoes.salvar, false),
    botao('Copiar senha', () => acoes.copiar(editorAtual.senha), false, true),
    botao('Apagar', acoes.apagar, false, true),
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

function segundo(vista: Vista, rascunho: Rascunho, acoes: Acoes): HTMLElement {
  const bloco = el('section', 'pilha');
  bloco.append(paragrafo('O cofre pede o segundo fator.', ''));
  if (vista.metodos.includes('totp')) {
    bloco.append(campo('Código TOTP', 'text', rascunho.codigo, (valor) => { rascunho.codigo = valor; }));
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

function campo(rotulo: string, tipo: string, valor: string, aoMudar: (valor: string) => void): HTMLLabelElement {
  const etiqueta = document.createElement('label');
  etiqueta.textContent = rotulo;
  const entrada = document.createElement('input');
  entrada.type = tipo;
  entrada.value = valor;
  entrada.autocomplete = 'off';
  entrada.spellcheck = false;
  entrada.addEventListener('input', () => aoMudar(entrada.value));
  etiqueta.append(entrada);
  return etiqueta;
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

function el(tag: 'main' | 'div' | 'section' | 'p', classe: string): HTMLElement {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  return elemento;
}
