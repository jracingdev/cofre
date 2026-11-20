/**
 * Gera a extensão para Chrome/Edge e Firefox e os .zip de download em servidor/public/downloads.
 * O resultado é reprodutível (mesmos bytes a cada build): o CI confere com git diff,
 * como faz com o cofre web em servidor/public/app.
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { build } from 'esbuild';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const downloads = resolve(raiz, '../servidor/public/downloads');
const pacote = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
// BROQUEL_SERVIDOR existe só para testar com um servidor local: gera dist-teste e não toca nos downloads.
const TESTE = process.env.BROQUEL_SERVIDOR ?? '';
const SERVIDOR = TESTE || 'https://broquel.jracing.dev.br';

const POLITICA = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self'",
  `connect-src ${SERVIDOR}`,
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

function manifesto(navegador) {
  const base = {
    manifest_version: 3,
    name: 'Broquel',
    short_name: 'Broquel',
    version: pacote.version,
    description: 'Cofre de senhas Broquel: sugere guardar e preenche só no site certo. Cifra de ponta a ponta.',
    homepage_url: SERVIDOR,
    icons: { 16: 'icones/16.png', 32: 'icones/32.png', 48: 'icones/48.png', 128: 'icones/128.png' },
    action: {
      default_title: 'Broquel',
      default_popup: 'popup.html',
      default_icon: { 16: 'icones/16.png', 32: 'icones/32.png', 48: 'icones/48.png' },
    },
    // activeTab: o endereço da aba só é visto quando o usuário abre o popup ou usa o atalho.
    permissions: ['storage', 'alarms', 'idle', 'clipboardWrite', 'activeTab', ...(TESTE ? ['tabs'] : [])],
    host_permissions: [`${SERVIDOR}/*`],
    content_scripts: [
      {
        matches: ['https://*/*', 'http://*/*'],
        js: ['conteudo.js'],
        run_at: 'document_idle',
        all_frames: false,
      },
    ],
    commands: {
      preencher: {
        suggested_key: { default: 'Ctrl+Shift+L', mac: 'Command+Shift+L' },
        description: 'Preencher a senha deste site',
      },
    },
    content_security_policy: { extension_pages: POLITICA },
  };
  if (navegador === 'firefox') {
    return {
      ...base,
      background: { scripts: ['fundo.js'] },
      browser_specific_settings: {
        gecko: {
          id: 'broquel@jracing.dev.br',
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    };
  }
  return { ...base, minimum_chrome_version: '116', background: { service_worker: 'fundo.js' } };
}

async function empacotar(navegador, alvo) {
  rmSync(alvo, { recursive: true, force: true });
  mkdirSync(alvo, { recursive: true });
  await build({
    entryPoints: {
      fundo: join(raiz, 'src/fundo.ts'),
      conteudo: join(raiz, 'src/conteudo.ts'),
      popup: join(raiz, 'src/popup.ts'),
    },
    outdir: alvo,
    bundle: true,
    format: 'iife',
    target: navegador === 'firefox' ? ['firefox128'] : ['chrome116'],
    platform: 'browser',
    minify: true,
    legalComments: 'none',
    sourcemap: false,
    charset: 'utf8',
    alias: { '@broquel/cripto': resolve(raiz, '../packages/cripto/src/index.ts') },
    nodePaths: [join(raiz, 'node_modules')],
    define: { __SERVIDOR__: JSON.stringify(SERVIDOR) },
    logLevel: 'warning',
  });
  cpSync(join(raiz, 'estatico'), alvo, { recursive: true });
  writeFileSync(join(alvo, 'manifest.json'), `${JSON.stringify(manifesto(navegador), null, 2)}\n`);
  for (const arquivo of listar(alvo)) {
    const texto = arquivo.endsWith('.js') ? readFileSync(arquivo, 'utf8') : '';
    // Nada de código de fora: a extensão não carrega script remoto nem usa eval.
    if (/\beval\(|new Function\(|importScripts\(\s*['"]https?:/u.test(texto)) {
      throw new Error(`Código dinâmico em ${relative(alvo, arquivo)}.`);
    }
  }
}

function listar(pasta) {
  const saida = [];
  for (const nome of readdirSync(pasta).sort()) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) saida.push(...listar(caminho));
    else saida.push(caminho);
  }
  return saida;
}

/** Zip sem compressão e com data fixa: os mesmos arquivos dão sempre os mesmos bytes. */
function zipReprodutivel(pasta) {
  const DATA = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locais = [];
  const centrais = [];
  let deslocamento = 0;
  for (const arquivo of listar(pasta)) {
    const nome = Buffer.from(relative(pasta, arquivo).split('\\').join('/'), 'utf8');
    const dados = readFileSync(arquivo);
    const crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(10, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DATA, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(10, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DATA, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    locais.push(local, nome, dados);
    centrais.push(central, nome);
    deslocamento += local.length + nome.length + dados.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(centrais.length / 2, 8);
  fim.writeUInt16LE(centrais.length / 2, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

if (TESTE) {
  await empacotar('chrome', join(raiz, 'dist-teste'));
  console.log(`dist-teste para ${SERVIDOR}`);
  process.exit(0);
}

mkdirSync(downloads, { recursive: true });
const somas = [];
for (const navegador of ['chrome', 'firefox']) {
  const alvo = join(dist, navegador);
  await empacotar(navegador, alvo);
  const nome = `broquel-extensao-${navegador}.zip`;
  const zip = zipReprodutivel(alvo);
  writeFileSync(join(downloads, nome), zip);
  writeFileSync(join(downloads, `${nome}.versao`), `${pacote.version}\n`);
  somas.push(`${createHash('sha256').update(zip).digest('hex')}  ${nome}`);
}
writeFileSync(join(downloads, 'SHA256SUMS-extensao.txt'), `${somas.join('\n')}\n`);
console.log(somas.join('\n'));
