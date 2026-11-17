import {
  abrirCofre,
  abrirComKit,
  aoDeslizarComprimento,
  aoDeslizarNivel,
  criarCofre,
  estadoInicial,
  gerarSenha,
  lerCabecalho,
  type SessaoCofre,
} from '@broquel/cripto';
import { criarCliente } from './cliente.js';
import { deBase64, paraHex } from './codec.js';
import { gravarDeposito, lerDeposito } from './deposito.js';
import { alterarItem, excluirItem, incluirItem, lerConteudo } from './itens.js';
import { apagarConteudo, conteudoVazio } from './item.js';
import { copiarELimpar, criarVigia, type AreaTransferencia } from './memoria.js';
import { ErroSync, estadoVazio, relogioReal, sincronizar, type Fator, type Transporte } from './sincronia.js';
import { credencialParaEnvio, opcoesDeCriacao, opcoesDeLogin, type OpcoesServidor } from './webauthn.js';
import { desenhar, type Acoes, type Linha, type Rascunho, type TelaNome, type Vista } from './tela.js';
import './estilo.css';

const encontrado = document.querySelector<HTMLElement>('#aplicacao');
if (!encontrado) throw new Error('Página incompleta.');
const raiz: HTMLElement = encontrado;

const cliente = criarCliente();
const relogio = relogioReal();
let estado = estadoVazio();
let sessao: SessaoCofre | null = null;
let token = '';
let linhas: Linha[] = [];
let bloqueioSegundos = 60;
let fatorPendente: ((fator: Fator) => void) | null = null;
let editandoId: string | null = null;
let limpezaCopia: { cancelar: boolean } | null = null;

const vista: Vista = {
  tela: 'carregando',
  erro: '',
  aviso: '',
  ocupado: false,
  identificador: '',
  kit: '',
  linhas: [],
  gerador: estadoInicial(),
  senhaGerada: '',
  bloqueioSegundos: 60,
  metodos: [],
  segredoTotp: '',
  uriTotp: '',
  codigos: [],
  sessoes: [],
};

const rascunho: Rascunho = {
  senha: '',
  confirmacao: '',
  identificador: '',
  kit: '',
  editor: conteudoVazio(),
  codigo: '',
  senhaNova: '',
};

const vigia = criarVigia(() => bloqueioSegundos * 1000, () => Date.now(), () => { travar(); });
window.setInterval(() => vigia.verificar(), 1000);
for (const evento of ['pointerdown', 'keydown']) {
  window.addEventListener(evento, () => vigia.atividade());
}
window.addEventListener('pagehide', () => travar());

const acoes: Acoes = {
  criar: () => ir('criar'),
  abrirOutro: () => { void trazer(); },
  confirmarCriacao: () => { void criar(); },
  anoteiKit: () => {
    vista.kit = '';
    ir('lista');
    void sincronizarAgora();
  },
  abrir: () => { void abrir(); },
  abrirComKit: () => { void abrirKit(); },
  definirSenhaNova: () => { void senhaNova(); },
  novo: () => {
    editandoId = null;
    rascunho.editor = conteudoVazio();
    ir('editor');
  },
  editar: (id) => { void editar(id); },
  salvar: () => { void salvar(); },
  apagar: () => { void apagar(); },
  copiar: (texto) => { void copiar(texto); },
  gerar: () => { void gerar(); },
  usarGerada: () => {
    rascunho.editor = { ...conteudoVazio(), senha: vista.senhaGerada };
    vista.senhaGerada = '';
    ir('editor');
  },
  nivel: (valor) => {
    vista.gerador = aoDeslizarNivel(valor);
    desenhar(raiz, vista, rascunho, acoes);
  },
  comprimento: (valor) => {
    vista.gerador = aoDeslizarComprimento(vista.gerador, valor);
    desenhar(raiz, vista, rascunho, acoes);
  },
  sincronizar: () => { void sincronizarAgora(); },
  travar: () => travar(),
  ir,
  concluirFator: (tipo) => {
    const resolver = fatorPendente;
    fatorPendente = null;
    if (!resolver) return;
    if (tipo === 'webauthn') {
      resolver({
        tipo: 'webauthn',
        concluir: async (pedido) => {
          const credencial = await navigator.credentials.get({ publicKey: opcoesDeLogin(pedido.opcoes as OpcoesServidor) });
          if (!credencial) throw new ErroSync('autenticacao_falhou', 'A chave não respondeu.');
          return { desafioId: pedido.desafio_id, credencial: credencialParaEnvio(credencial as PublicKeyCredential) };
        },
      });
      return;
    }
    resolver({ tipo, codigo: rascunho.codigo.trim() });
    rascunho.codigo = '';
  },
  iniciarTotp: () => { void iniciarTotp(); },
  confirmarTotp: () => { void confirmarTotp(); },
  registrarChave: () => { void registrarChave(); },
  girarKit: () => { void girarKit(); },
  trocarSenha: () => { void trocarSenha(); },
  revogar: (id) => { void revogar(id); },
  bloqueio: (segundos) => {
    bloqueioSegundos = Math.min(300, Math.max(15, segundos));
    vista.bloqueioSegundos = bloqueioSegundos;
    void persistir();
    desenhar(raiz, vista, rascunho, acoes);
  },
};

void iniciar();

async function iniciar(): Promise<void> {
  try {
    const local = await lerDeposito();
    if (local && local.estado.cabecalho.length > 0) {
      estado = local.estado;
      bloqueioSegundos = local.bloqueioSegundos;
      vista.bloqueioSegundos = bloqueioSegundos;
      vista.identificador = paraHex(lerCabecalho(estado.cabecalho).cofreId);
      ir('abrir');
      return;
    }
  } catch (erro) {
    vista.erro = mensagem(erro);
  }
  ir('inicio');
}

async function criar(): Promise<void> {
  if (rascunho.senha !== rascunho.confirmacao) {
    vista.erro = 'As senhas não conferem.';
    desenhar(raiz, vista, rascunho, acoes);
    return;
  }
  await ocupado(async () => {
    const criado = await criarCofre(rascunho.senha);
    limparSenhas();
    sessao = criado.sessao;
    estado = {
      ...estadoVazio(),
      cofreId: paraHex(criado.sessao.cofreId),
      cabecalho: criado.cabecalho,
    };
    vista.identificador = estado.cofreId;
    vista.kit = criado.kitRecuperacao;
    await persistir();
    ir('kit');
  });
}

async function trazer(): Promise<void> {
  const id = rascunho.identificador.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) {
    vista.erro = 'O identificador tem 32 caracteres hexadecimais.';
    desenhar(raiz, vista, rascunho, acoes);
    return;
  }
  await ocupado(async () => {
    const cabecalho = deBase64(await cliente.cabecalho(id));
    if (paraHex(lerCabecalho(cabecalho).cofreId) !== id) throw new ErroSync('formato_invalido', 'O cabeçalho não bate com o identificador.');
    estado = { ...estadoVazio(), cofreId: id, cabecalho, registrado: true };
    vista.identificador = id;
    await persistir();
    ir('abrir');
  });
}

async function abrir(): Promise<void> {
  await ocupado(async () => {
    sessao = await abrirCofre(estado.cabecalho, rascunho.senha);
    limparSenhas();
    await mostrarLista();
  });
}

async function abrirKit(): Promise<void> {
  await ocupado(async () => {
    sessao = await abrirComKit(estado.cabecalho, rascunho.kit.trim());
    rascunho.kit = '';
    limparSenhas();
    ir('nova-senha');
  });
}

async function senhaNova(): Promise<void> {
  if (!sessao) return;
  if (rascunho.senhaNova !== rascunho.confirmacao) {
    vista.erro = 'As senhas não conferem.';
    desenhar(raiz, vista, rascunho, acoes);
    return;
  }
  await ocupado(async () => {
    estado.cabecalho = await sessao!.trocarSenhaMestra(estado.cabecalho, rascunho.senhaNova);
    limparSenhas();
    await persistir();
    await mostrarLista();
    vista.aviso = 'Senha mestra trocada. Sincronize para o servidor guardar o cabeçalho novo.';
    desenhar(raiz, vista, rascunho, acoes);
  });
}

async function editar(id: string): Promise<void> {
  if (!sessao) return;
  const item = estado.itens.find((atual) => atual.itemId === id);
  if (!item) return;
  editandoId = id;
  rascunho.editor = await lerConteudo(sessao, item);
  ir('editor');
}

async function salvar(): Promise<void> {
  if (!sessao) return;
  const id = editandoId;
  await ocupado(async () => {
    estado.itens = id
      ? await alterarItem(sessao!, estado.itens, id, rascunho.editor, relogio.agora())
      : await incluirItem(sessao!, estado.itens, rascunho.editor, relogio.agora(), relogio.aleatorio(16));
    editandoId = null;
    apagarConteudo(rascunho.editor);
    await persistir();
    await mostrarLista();
  });
}

async function apagar(): Promise<void> {
  if (!sessao) return;
  const id = editandoId;
  if (!id) return;
  await ocupado(async () => {
    estado.itens = await excluirItem(sessao!, estado.itens, id, relogio.agora());
    apagarConteudo(rascunho.editor);
    await persistir();
    await mostrarLista();
  });
}

async function gerar(): Promise<void> {
  vista.senhaGerada = await gerarSenha({ nivel: vista.gerador.nivel, comprimento: vista.gerador.comprimento });
  desenhar(raiz, vista, rascunho, acoes);
}

async function sincronizarAgora(): Promise<void> {
  if (!sessao) return;
  await ocupado(async () => {
    const resultado = await sincronizar(estado, sessao!, cliente as Transporte, pedirFator, relogio);
    estado = resultado.estado;
    token = resultado.token;
    await persistir();
    await mostrarLista();
    vista.aviso = resultado.retrocesso
      ? 'Sincronizado. O servidor ofereceu uma revisão antiga e ela foi ignorada.'
      : 'Sincronizado.';
    desenhar(raiz, vista, rascunho, acoes);
  });
}

function pedirFator(metodos: string[]): Promise<Fator> {
  vista.metodos = metodos;
  vista.ocupado = false;
  ir('segundo');
  return new Promise((resolver) => {
    fatorPendente = resolver;
  });
}

async function iniciarTotp(): Promise<void> {
  if (!token) {
    vista.erro = 'Sincronize antes de ligar o segundo fator.';
    desenhar(raiz, vista, rascunho, acoes);
    return;
  }
  await ocupado(async () => {
    const inicio = await cliente.iniciarTotp(token);
    vista.segredoTotp = inicio.segredo;
    vista.uriTotp = inicio.uri;
    vista.aviso = 'Guarde o segredo no aplicativo autenticador e confirme o código. Ele não fica gravado neste navegador.';
    desenhar(raiz, vista, rascunho, acoes);
  });
}

async function confirmarTotp(): Promise<void> {
  if (!token) return;
  await ocupado(async () => {
    vista.codigos = await cliente.confirmarTotp(token, rascunho.codigo.trim());
    rascunho.codigo = '';
    vista.segredoTotp = '';
    vista.uriTotp = '';
    vista.aviso = 'TOTP ligado. Anote os códigos de recuperação agora.';
    desenhar(raiz, vista, rascunho, acoes);
  });
}

async function registrarChave(): Promise<void> {
  if (!token) {
    vista.erro = 'Sincronize antes de cadastrar a chave.';
    desenhar(raiz, vista, rascunho, acoes);
    return;
  }
  await ocupado(async () => {
    const pedido = await cliente.opcoesRegistro(token);
    const credencial = await navigator.credentials.create({ publicKey: opcoesDeCriacao(pedido.opcoes as OpcoesServidor) });
    if (!credencial) throw new ErroSync('autenticacao_falhou', 'A chave não foi criada.');
    await cliente.confirmarRegistro(token, pedido.desafio_id, credencialParaEnvio(credencial as PublicKeyCredential));
    vista.aviso = 'Chave FIDO2 cadastrada.';
    desenhar(raiz, vista, rascunho, acoes);
  });
}

async function girarKit(): Promise<void> {
  if (!sessao) return;
  await ocupado(async () => {
    const girado = await sessao!.girarKitRecuperacao(estado.cabecalho);
    estado.cabecalho = girado.cabecalho;
    vista.kit = girado.kitRecuperacao;
    await persistir();
    ir('kit');
  });
}

async function trocarSenha(): Promise<void> {
  if (!sessao || rascunho.senhaNova.length === 0) return;
  await ocupado(async () => {
    estado.cabecalho = await sessao!.trocarSenhaMestra(estado.cabecalho, rascunho.senhaNova);
    limparSenhas();
    await persistir();
    vista.aviso = 'Senha trocada neste navegador. Sincronize para publicar o cabeçalho.';
    ir('ajustes');
  });
}

async function revogar(id: string): Promise<void> {
  if (!token) return;
  await ocupado(async () => {
    await cliente.revogar(token, id);
    vista.sessoes = await cliente.sessoes(token);
    desenhar(raiz, vista, rascunho, acoes);
  });
}

async function mostrarLista(): Promise<void> {
  if (!sessao) return;
  const proximas: Linha[] = [];
  for (const item of estado.itens) {
    if (item.apagado) continue;
    try {
      const conteudo = await lerConteudo(sessao, item);
      proximas.push({
        id: item.itemId,
        titulo: conteudo.titulo || 'Sem título',
        usuario: conteudo.usuario,
        conflito: conteudo.conflitoDe != null,
      });
      apagarConteudo(conteudo);
    } catch {
      proximas.push({ id: item.itemId, titulo: 'Item ilegível', usuario: '', conflito: false });
    }
  }
  linhas = proximas;
  vista.linhas = linhas;
  vigia.armar();
  if (token) {
    try {
      vista.sessoes = await cliente.sessoes(token);
    } catch {
      vista.sessoes = [];
    }
  }
  ir('lista');
}

function travar(): void {
  sessao?.travar();
  sessao = null;
  token = '';
  limparSenhas();
  vista.kit = '';
  vista.senhaGerada = '';
  vista.segredoTotp = '';
  vista.uriTotp = '';
  vista.codigos = [];
  vista.linhas = [];
  vista.sessoes = [];
  linhas = [];
  editandoId = null;
  apagarConteudo(rascunho.editor);
  if (limpezaCopia) limpezaCopia.cancelar = true;
  vigia.desarmar();
  ir(estado.cabecalho.length > 0 ? 'abrir' : 'inicio');
}

async function persistir(): Promise<void> {
  await gravarDeposito(estado, bloqueioSegundos);
}

async function copiar(texto: string): Promise<void> {
  if (!texto) return;
  if (limpezaCopia) limpezaCopia.cancelar = true;
  const marca = { cancelar: false };
  limpezaCopia = marca;
  const area: AreaTransferencia = {
    ler: async () => navigator.clipboard.readText(),
    escrever: async (valor) => { await navigator.clipboard.writeText(valor); },
  };
  void copiarELimpar(texto, area, (ms) => new Promise((resolver) => {
    window.setTimeout(() => resolver(), ms);
  })).then(() => {
    if (!marca.cancelar) vista.aviso = '';
  }).catch(() => {
    if (marca.cancelar) return;
    vista.erro = 'Não foi possível usar a área de transferência.';
    desenhar(raiz, vista, rascunho, acoes);
  });
  vista.aviso = 'Copiado. A área de transferência será limpa.';
  desenhar(raiz, vista, rascunho, acoes);
}

function ir(tela: TelaNome): void {
  vista.tela = tela;
  vista.erro = '';
  if (tela !== 'kit') vista.aviso = tela === 'lista' ? vista.aviso : '';
  desenhar(raiz, vista, rascunho, acoes);
}

async function ocupado(acao: () => Promise<void>): Promise<void> {
  vista.ocupado = true;
  vista.erro = '';
  desenhar(raiz, vista, rascunho, acoes);
  try {
    await acao();
    vista.ocupado = false;
    desenhar(raiz, vista, rascunho, acoes);
  } catch (erro) {
    vista.erro = mensagem(erro);
    vista.ocupado = false;
    desenhar(raiz, vista, rascunho, acoes);
  }
}

function limparSenhas(): void {
  rascunho.senha = '';
  rascunho.confirmacao = '';
  rascunho.senhaNova = '';
}

function mensagem(erro: unknown): string {
  if (erro instanceof Error && erro.message) return erro.message;
  return 'Não foi possível concluir.';
}
