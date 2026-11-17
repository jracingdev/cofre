import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
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

writeFileSync(htmlPath, html);
