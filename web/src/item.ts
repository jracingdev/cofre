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

export function apagarConteudo(conteudo: ConteudoLogin): void {
  conteudo.titulo = '';
  conteudo.usuario = '';
  conteudo.senha = '';
  conteudo.url = '';
  conteudo.notas = '';
  conteudo.conflitoDe = null;
}
