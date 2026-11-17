import {
  ALFABETO_DIGITOS,
  ALFABETO_MAIUSCULAS,
  ALFABETO_MINUSCULAS,
  ALFABETO_SIMBOLOS,
  CARACTERES_AMBIGUOS,
  COMPRIMENTO_MAX,
  COMPRIMENTO_MIN,
} from './constantes.js';
import { ErroCofre } from './erros.js';
import { preparar, sodium } from './sodio.js';

export type FonteUniforme = (teto: number) => number;

export type NivelId = 1 | 2 | 3 | 4;

export type NivelGerador = {
  nivel: NivelId;
  nome: 'basico' | 'forte' | 'alto' | 'militar';
  rotulo: string;
  comprimentoPadrao: number;
  comprimentoMinimo: number;
  minusculas: boolean;
  maiusculas: boolean;
  digitos: boolean;
  simbolos: boolean;
  excluirAmbiguos: boolean;
};

export const NIVEIS_GERADOR: readonly NivelGerador[] = [
  {
    nivel: 1,
    nome: 'basico',
    rotulo: 'Básico',
    comprimentoPadrao: 16,
    comprimentoMinimo: 12,
    minusculas: true,
    maiusculas: true,
    digitos: true,
    simbolos: false,
    excluirAmbiguos: true,
  },
  {
    nivel: 2,
    nome: 'forte',
    rotulo: 'Forte',
    comprimentoPadrao: 20,
    comprimentoMinimo: 16,
    minusculas: true,
    maiusculas: true,
    digitos: true,
    simbolos: true,
    excluirAmbiguos: true,
  },
  {
    nivel: 3,
    nome: 'alto',
    rotulo: 'Alto',
    comprimentoPadrao: 28,
    comprimentoMinimo: 24,
    minusculas: true,
    maiusculas: true,
    digitos: true,
    simbolos: true,
    excluirAmbiguos: true,
  },
  {
    nivel: 4,
    nome: 'militar',
    rotulo: 'Militar',
    comprimentoPadrao: 40,
    comprimentoMinimo: 32,
    minusculas: true,
    maiusculas: true,
    digitos: true,
    simbolos: true,
    excluirAmbiguos: true,
  },
];

export type OpcoesGerador = {
  comprimento: number;
  minusculas: boolean;
  maiusculas: boolean;
  digitos: boolean;
  simbolos: boolean;
  excluirAmbiguos: boolean;
};

export type EntradaGerador = {
  nivel?: number;
  comprimento?: number;
};

export type EstadoControles = {
  nivel: NivelId;
  comprimento: number;
};

export type MarcaControle = { valor: number; rotulo: string };

export type ControleDeslizante = {
  id: 'nivel' | 'comprimento';
  rotulo: string;
  minimo: number;
  maximo: number;
  passo: number;
  valor: number;
  marcas: MarcaControle[];
};

export function obterNivel(nivel: number): NivelGerador {
  const encontrado = NIVEIS_GERADOR.find((item) => item.nivel === nivel);
  if (!encontrado || !Number.isInteger(nivel)) {
    throw new ErroCofre('gerador_invalido', 'Nível do gerador inválido.');
  }
  return encontrado;
}

/** Posição inicial dos controles: nível militar. */
export function estadoInicial(): EstadoControles {
  return aoDeslizarNivel(4);
}

/** O controle de nível saltou para outra parada. O comprimento volta ao padrão da parada. */
export function aoDeslizarNivel(valor: number): EstadoControles {
  if (!Number.isFinite(valor)) {
    throw new ErroCofre('gerador_invalido', 'Posição do controle inválida.');
  }
  const nivel = Math.min(4, Math.max(1, Math.round(valor))) as NivelId;
  const definicao = obterNivel(nivel);
  return { nivel, comprimento: definicao.comprimentoPadrao };
}

/** O controle de comprimento andou. Não desce do mínimo do nível nem passa de 128. */
export function aoDeslizarComprimento(estado: EstadoControles, valor: number): EstadoControles {
  const definicao = obterNivel(estado.nivel);
  if (!Number.isFinite(valor)) {
    throw new ErroCofre('gerador_invalido', 'Posição do controle inválida.');
  }
  const pedido = Math.round(valor);
  const comprimento = Math.min(COMPRIMENTO_MAX, Math.max(definicao.comprimentoMinimo, pedido));
  return { nivel: definicao.nivel, comprimento };
}

export function opcoesDeControles(estado: EstadoControles): OpcoesGerador {
  const definicao = obterNivel(estado.nivel);
  const comprimento = estado.comprimento;
  if (!Number.isInteger(comprimento) || comprimento < definicao.comprimentoMinimo || comprimento > COMPRIMENTO_MAX) {
    throw new ErroCofre('gerador_invalido', 'Comprimento fora da faixa deste nível.');
  }
  return {
    comprimento,
    minusculas: definicao.minusculas,
    maiusculas: definicao.maiusculas,
    digitos: definicao.digitos,
    simbolos: definicao.simbolos,
    excluirAmbiguos: definicao.excluirAmbiguos,
  };
}

/** Os dois controles que a tela desenha. O mínimo do comprimento muda com o nível. */
export function controles(estado: EstadoControles): [ControleDeslizante, ControleDeslizante] {
  const definicao = obterNivel(estado.nivel);
  return [
    {
      id: 'nivel',
      rotulo: 'Nível',
      minimo: 1,
      maximo: 4,
      passo: 1,
      valor: definicao.nivel,
      marcas: NIVEIS_GERADOR.map((item) => ({ valor: item.nivel, rotulo: item.rotulo })),
    },
    {
      id: 'comprimento',
      rotulo: 'Comprimento',
      minimo: definicao.comprimentoMinimo,
      maximo: COMPRIMENTO_MAX,
      passo: 1,
      valor: estado.comprimento,
      marcas: [],
    },
  ];
}

export function montarClasses(opcoes: OpcoesGerador): string[] {
  const filtrar = (alfabeto: string): string => {
    if (!opcoes.excluirAmbiguos) return alfabeto;
    return [...alfabeto].filter((caractere) => !CARACTERES_AMBIGUOS.includes(caractere)).join('');
  };
  const classes: string[] = [];
  if (opcoes.minusculas) classes.push(filtrar(ALFABETO_MINUSCULAS));
  if (opcoes.maiusculas) classes.push(filtrar(ALFABETO_MAIUSCULAS));
  if (opcoes.digitos) classes.push(filtrar(ALFABETO_DIGITOS));
  if (opcoes.simbolos) classes.push(filtrar(ALFABETO_SIMBOLOS));
  if (classes.length === 0 || classes.some((classe) => classe.length === 0)) {
    throw new ErroCofre('gerador_invalido', 'O gerador ficou sem caracteres.');
  }
  return classes;
}

/**
 * Piso da escolha dos caracteres, em bits, para o texto ao lado do controle.
 * Não é certificação. Não soma a permutação final.
 */
export function entropiaMinimaBits(estado: EstadoControles): number {
  const opcoes = opcoesDeControles(estado);
  const classes = montarClasses(opcoes);
  const alfabeto = classes.reduce((total, classe) => total + classe.length, 0);
  let bits = (opcoes.comprimento - classes.length) * Math.log2(alfabeto);
  for (const classe of classes) bits += Math.log2(classe.length);
  return Math.floor(bits);
}

function resolver(entrada: EntradaGerador): OpcoesGerador {
  if (entrada.nivel === undefined && entrada.comprimento === undefined) {
    return opcoesDeControles(estadoInicial());
  }
  if (entrada.nivel === undefined) {
    throw new ErroCofre('gerador_invalido', 'Informe o nível do gerador.');
  }
  const definicao = obterNivel(entrada.nivel);
  return opcoesDeControles({
    nivel: definicao.nivel,
    comprimento: entrada.comprimento ?? definicao.comprimentoPadrao,
  });
}

function uniformeSeguro(fonte: FonteUniforme, teto: number): number {
  const valor = fonte(teto);
  if (!Number.isInteger(valor) || valor < 0 || valor >= teto) {
    throw new ErroCofre('gerador_invalido', 'A fonte aleatória devolveu um número fora da faixa.');
  }
  return valor;
}

/**
 * Gera a senha no próprio aparelho.
 * Sem o argumento `fonte`, usa randombytes_uniform do libsodium.
 * A fonte injetada existe para os vetores de teste. Não use outra fonte num cofre real.
 */
export async function gerarSenha(entrada: EntradaGerador = {}, fonte?: FonteUniforme): Promise<string> {
  await preparar();
  const opcoes = resolver(entrada);
  if (opcoes.comprimento < COMPRIMENTO_MIN) {
    throw new ErroCofre('gerador_invalido', 'A senha gerada fica abaixo do mínimo.');
  }
  const classes = montarClasses(opcoes);
  const alfabeto = classes.join('');
  const sortear = fonte ?? ((teto: number) => sodium.randombytes_uniform(teto));
  const caracteres: string[] = [];
  for (const classe of classes) {
    caracteres.push(classe[uniformeSeguro(sortear, classe.length)]!);
  }
  while (caracteres.length < opcoes.comprimento) {
    caracteres.push(alfabeto[uniformeSeguro(sortear, alfabeto.length)]!);
  }
  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const j = uniformeSeguro(sortear, i + 1);
    const atual = caracteres[i]!;
    caracteres[i] = caracteres[j]!;
    caracteres[j] = atual;
  }
  return caracteres.join('');
}
