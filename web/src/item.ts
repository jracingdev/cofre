export type ConteudoLogin = {
  titulo: string;
  usuario: string;
  senha: string;
  url: string;
  notas: string;
  conflitoDe: string | null;
};

export function conteudoVazio(): ConteudoLogin {
  return { titulo: '', usuario: '', senha: '', url: '', notas: '', conflitoDe: null };
}

/** O mesmo JSON do aplicativo, sem espaços e com as chaves nesta ordem. */
export function serializarLogin(conteudo: ConteudoLogin): Uint8Array {
  const campos = `{"usuario":${JSON.stringify(conteudo.usuario)},"senha":${JSON.stringify(conteudo.senha)},"url":${JSON.stringify(conteudo.url)},"notas":${JSON.stringify(conteudo.notas)}}`;
  const conflito = conteudo.conflitoDe == null ? 'null' : JSON.stringify(conteudo.conflitoDe);
  const texto = `{"v":1,"tipo":"login","titulo":${JSON.stringify(conteudo.titulo)},"campos":${campos},"conflito_de":${conflito}}`;
  return new TextEncoder().encode(texto);
}

export function lerLogin(bytes: Uint8Array): ConteudoLogin {
  if (bytes.length === 0) return conteudoVazio();
  const json = JSON.parse(new TextDecoder().decode(bytes)) as {
    v?: number;
    tipo?: string;
    titulo?: string;
    campos?: { usuario?: string; senha?: string; url?: string; notas?: string };
    conflito_de?: string | null;
  };
  if (json.v !== 1 || json.tipo !== 'login' || !json.campos) {
    throw new Error('O item não é um login desta versão.');
  }
  return {
    titulo: json.titulo ?? '',
    usuario: json.campos.usuario ?? '',
    senha: json.campos.senha ?? '',
    url: json.campos.url ?? '',
    notas: json.campos.notas ?? '',
    conflitoDe: json.conflito_de ?? null,
  };
}

export function serializarNome(nome: string): Uint8Array {
  return new TextEncoder().encode(`{"v":1,"tipo":"nome","nome":${JSON.stringify(nome)}}`);
}

export function lerNome(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return null;
  const json = JSON.parse(new TextDecoder().decode(bytes)) as { v?: number; tipo?: string; nome?: string };
  if (json.v !== 1 || json.tipo !== 'nome' || typeof json.nome !== 'string') return null;
  return json.nome;
}

export function normalizarNome(nome: string): string {
  const limpo = nome.trim();
  if ([...limpo].length > 40) {
    throw new Error('O nome do cofre passa de 40 caracteres.');
  }
  if (/[\u0000-\u001f]/u.test(limpo)) {
    throw new Error('O nome do cofre tem um caractere inválido.');
  }
  return limpo;
}

export function abreviarIdentificador(cofreId: string): string {
  if (cofreId.length < 8) return cofreId;
  return `${cofreId.slice(0, 8)}…`;
}

export function apagarConteudo(conteudo: ConteudoLogin): void {
  conteudo.titulo = '';
  conteudo.usuario = '';
  conteudo.senha = '';
  conteudo.url = '';
  conteudo.notas = '';
  conteudo.conflitoDe = null;
}
