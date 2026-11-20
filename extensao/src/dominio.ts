/**
 * Mesma regra do preenchimento do Android (android/.../autofill/Preenchimento.kt):
 * um item só serve para o mesmo domínio ou subdomínio, nos dois sentidos,
 * e sufixos que vários donos compartilham (com.br, github.io...) nunca combinam.
 */

const SUFIXOS = new Set([
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'art.br', 'blog.br', 'app.br', 'dev.br', 'eco.br', 'ind.br', 'inf.br',
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.au', 'net.au', 'org.au', 'co.jp', 'ne.jp', 'com.ar', 'com.mx',
  'co.nz', 'com.pt', 'co.za', 'com.cn', 'com.tr', 'github.io', 'vercel.app', 'netlify.app', 'pages.dev', 'web.app',
  'firebaseapp.com', 'herokuapp.com', 'blogspot.com', 'workers.dev',
]);

function ehSufixoPublico(host: string): boolean {
  return !host.includes('.') || SUFIXOS.has(host);
}

/** Host de um endereço guardado no item. Aceita "banco.com.br/entrar" sem esquema. */
export function hostDe(texto: string): string | null {
  const limpo = texto.trim().toLowerCase();
  if (!limpo) return null;
  const comEsquema = limpo.includes('://') ? limpo : `https://${limpo}`;
  try {
    const url = new URL(comEsquema);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.hostname.replace(/\.$/u, '') || null;
  } catch {
    return null;
  }
}

/** O item com este endereço serve para a página deste host? */
export function combina(urlItem: string, hostPagina: string): boolean {
  const host = hostDe(urlItem);
  if (!host) return false;
  const pagina = hostPagina.trim().toLowerCase().replace(/\.$/u, '').replace(/^www\./u, '');
  const item = host.replace(/^www\./u, '');
  if (!pagina || ehSufixoPublico(item) || ehSufixoPublico(pagina)) return false;
  return item === pagina || pagina.endsWith(`.${item}`) || item.endsWith(`.${pagina}`);
}

/**
 * Host de uma página onde a extensão pode agir. Só https, ou http em localhost/rede local
 * (roteador, intranet). Qualquer outro esquema (chrome:, file:, about:) fica de fora.
 */
export function hostDaPagina(url: string | undefined): { host: string; seguro: boolean } | null {
  if (!url) return null;
  try {
    const endereco = new URL(url);
    if (endereco.protocol === 'https:') return { host: endereco.hostname.toLowerCase(), seguro: true };
    if (endereco.protocol === 'http:') return { host: endereco.hostname.toLowerCase(), seguro: false };
    return null;
  } catch {
    return null;
  }
}

/** Título sugerido para um item novo: o host sem "www.". */
export function tituloDoHost(host: string): string {
  return host.replace(/^www\./u, '');
}

/**
 * Páginas onde a extensão sugere, guarda e preenche: https, ou http só em localhost
 * e endereços de rede local (roteador, intranet). Em http público a senha iria às claras.
 */
export function paginaConfiavel(pagina: { host: string; seguro: boolean }): boolean {
  if (pagina.seguro) return true;
  const host = pagina.host;
  if (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]') return true;
  const partes = host.split('.').map(Number);
  if (partes.length !== 4 || partes.some((parte) => !Number.isInteger(parte) || parte < 0 || parte > 255)) return false;
  const [a, b] = partes as [number, number, number, number];
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}
