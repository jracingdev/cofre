import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLITICA } from '../politica.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../servidor/public/app');
const htmlPath = join(raiz, 'index.html');
let html = readFileSync(htmlPath, 'utf8');

if (/<script[^>]+src="https?:/i.test(html) || /<link[^>]+href="https?:/i.test(html)) {
  throw new Error('O build apontou para um endereço externo.');
}

html = html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/i, '');
html = html.replace('</title>', `</title>\n    <meta http-equiv="Content-Security-Policy" content="${POLITICA}">`);

html = html.replace(/<(script|link)\b([^>]*)>/gi, (completo, etiqueta, atributos) => {
  const achado = /(?:src|href)="([^"]+)"/.exec(atributos);
  if (!achado) return completo;
  const url = achado[1];
  if (url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:')) {
    throw new Error(`Recurso não permitido: ${url}`);
  }
  if (etiqueta.toLowerCase() === 'link' && !/rel="stylesheet"|rel="icon"|rel='stylesheet'|rel='icon'/.test(atributos)) {
    return completo;
  }
  if (etiqueta.toLowerCase() === 'link' && /rel="icon"|rel='icon'/.test(atributos)) {
    return completo;
  }
  const relativo = url.replace(/^\//, '').replace(/^app\//, '');
  const bytes = readFileSync(join(raiz, relativo));
  const hash = createHash('sha384').update(bytes).digest('base64');
  let attrs = atributos;
  if (!/crossorigin/.test(attrs)) attrs += ' crossorigin="anonymous"';
  if (/integrity=/.test(attrs)) return `<${etiqueta}${attrs}>`;
  return `<${etiqueta}${attrs} integrity="sha384-${hash}">`;
});

// O git entrega texto com LF no servidor; o arquivo gravado aqui também.
writeFileSync(htmlPath, html.replace(/\r\n/g, '\n'));

// Hash de cada arquivo como o servidor entrega. Fica no repositório, fora do servidor,
// para conferir o site publicado com scripts/conferir-web.sh.
const TEXTO = /\.(html|css|js|svg|webmanifest|json|txt)$/;
function conteudoPublicado(arquivo) {
  const bytes = readFileSync(join(raiz, arquivo));
  return TEXTO.test(arquivo) ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : bytes;
}
function listar(pasta, prefixo = '') {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const relativo = prefixo + entrada.name;
    return entrada.isDirectory() ? listar(join(pasta, entrada.name), `${relativo}/`) : [relativo];
  });
}
const linhas = listar(raiz)
  .sort()
  .map((arquivo) => `${createHash('sha256').update(conteudoPublicado(arquivo)).digest('hex')}  ${arquivo}`);
writeFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../BUILD-SHA256.txt'), `${linhas.join('\n')}\n`);
