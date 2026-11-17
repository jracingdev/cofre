import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { conferirArquivo, estadoParaArquivo } from '../src/arquivo.ts';
import { decidirConflito } from '../src/conflito.ts';
import { lerLogin, serializarLogin } from '../src/item.ts';
import { copiarELimpar, criarVigia } from '../src/memoria.ts';
import { estadoVazio } from '../src/sincronia.ts';
import { credencialParaEnvio, opcoesDeCriacao, opcoesDeLogin } from '../src/webauthn.ts';
import { paraBase64Url } from '../src/codec.ts';

const JSON_DO_APP = '{"v":1,"tipo":"login","titulo":"Banco","campos":{"usuario":"ana","senha":"segredo","url":"https://banco","notas":""},"conflito_de":null}';

test('o login usa o mesmo JSON do aplicativo', () => {
  const bytes = serializarLogin({
    titulo: 'Banco',
    usuario: 'ana',
    senha: 'segredo',
    url: 'https://banco',
    notas: '',
    conflitoDe: null,
  });
  assert.equal(new TextDecoder().decode(bytes), JSON_DO_APP);
  assert.equal(lerLogin(bytes).senha, 'segredo');
  assert.equal(lerLogin(new Uint8Array()).titulo, '');
});

test('conflito segue a especificação', () => {
  assert.equal(decidirConflito(false, false, true, true), 'adotar-servidor');
  assert.equal(decidirConflito(true, true, false, true), 'adotar-servidor');
  assert.equal(decidirConflito(false, true, false, true), 'reenviar-edicao-local');
  assert.equal(decidirConflito(true, false, false, true), 'reenviar-edicao-servidor');
  assert.equal(decidirConflito(false, false, false, false), 'bifurcar');
  assert.equal(decidirConflito(false, false, false, true), 'bifurcar');
});

test('a cópia é apagada e o bloqueio dispara', async () => {
  const escritos: string[] = [];
  let relogio = 0;
  await copiarELimpar('segredo', {
    ler: async () => escritos.at(-1) ?? '',
    escrever: async (texto) => { escritos.push(texto); },
  }, async () => { relogio += 45_000; }, 45_000);
  assert.deepEqual(escritos, ['segredo', '']);

  let bloqueou = false;
  let agora = 0;
  const vigia = criarVigia(() => 15_000, () => agora, () => { bloqueou = true; });
  agora = 14_000;
  vigia.verificar();
  assert.equal(bloqueou, false);
  agora = 15_000;
  vigia.verificar();
  assert.equal(bloqueou, true);
});

test('o arquivo local recusa chave e senha', () => {
  const arquivo = estadoParaArquivo({ ...estadoVazio(), cofreId: 'ab', cabecalho: new Uint8Array([1]) }, 60);
  assert.equal(JSON.stringify(arquivo).includes('senha'), false);
  assert.throws(() => conferirArquivo({ ...arquivo, senha: 'x' }));
  assert.throws(() => conferirArquivo({ ...arquivo, token: 'x' }));
});

test('a política não abre script de fora nem estilo embutido', async () => {
  const politica = await readFile(new URL('../politica.mjs', import.meta.url), 'utf8');
  assert.match(politica, /default-src 'none'/);
  assert.match(politica, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(politica, /style-src 'self'/);
  assert.match(politica, /connect-src 'self'/);
  assert.doesNotMatch(politica, /'unsafe-inline'|'unsafe-eval'|https?:/);
});

test('o código do cofre não usa localStorage', async () => {
  const nomes = await readdir(new URL('../src/', import.meta.url));
  for (const nome of nomes) {
    const texto = await readFile(new URL(`../src/${nome}`, import.meta.url), 'utf8');
    assert.equal(/\blocalStorage\b/.test(texto), false, nome);
    assert.equal(/\bsessionStorage\b/.test(texto), false, nome);
  }
});

test('as opções FIDO2 saem de base64url', () => {
  const criacao = opcoesDeCriacao({
    challenge: paraBase64Url(Uint8Array.of(1, 2, 3)),
    rp: { name: 'Broquel', id: 'localhost' },
    user: { id: paraBase64Url(new TextEncoder().encode('abc')), name: 'cofre', displayName: 'Broquel' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  });
  assert.deepEqual([...criacao.challenge], [1, 2, 3]);
  assert.equal(new TextDecoder().decode(criacao.user.id), 'abc');
  const login = opcoesDeLogin({ challenge: paraBase64Url(Uint8Array.of(9)), rpId: 'localhost', userVerification: 'preferred' });
  assert.deepEqual([...login.challenge], [9]);
  const enviada = credencialParaEnvio({ toJSON: () => ({ id: 'abc', type: 'public-key' }) } as PublicKeyCredential);
  assert.equal(enviada.id, 'abc');
});
