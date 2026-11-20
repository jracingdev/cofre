import assert from 'node:assert/strict';
import test from 'node:test';
import { combina, hostDaPagina, hostDe, paginaConfiavel, tituloDoHost } from '../src/dominio.ts';

// Os mesmos casos de android/app/src/test/java/app/broquel/PreenchimentoTest.kt.
const banco = 'login.banco.com.br';

test('mesmo site e subdomínio combinam', () => {
  assert.ok(combina('https://banco.com.br', banco));
  assert.ok(combina('banco.com.br/entrar', banco));
  assert.ok(combina('https://www.login.banco.com.br', banco));
  assert.ok(combina('https://login.banco.com.br', 'www.banco.com.br'));
});

test('site parecido não combina', () => {
  assert.equal(combina('https://banco.com.br.golpe.com', banco), false);
  assert.equal(combina('https://outrobanco.com.br', banco), false);
  assert.equal(combina('https://com.br', banco), false);
  assert.equal(combina('', banco), false);
  assert.equal(combina('https://banco.com.br', 'banco.com.br.golpe.com'), false);
  assert.equal(combina('https://usuario.github.io', 'outro.github.io'), false);
  assert.equal(combina('https://github.io', 'golpe.github.io'), false);
});

test('item de app Android não vale para site', () => {
  assert.equal(combina('androidapp://br.com.banco.app', 'banco.com.br'), false);
  assert.equal(hostDe('javascript:alert(1)'), null);
});

test('páginas onde a extensão age', () => {
  assert.deepEqual(hostDaPagina('https://Banco.com.br/x'), { host: 'banco.com.br', seguro: true });
  assert.equal(hostDaPagina('chrome://settings'), null);
  assert.equal(hostDaPagina('file:///c:/senhas.html'), null);
  assert.ok(paginaConfiavel({ host: 'banco.com.br', seguro: true }));
  assert.ok(paginaConfiavel({ host: '192.168.0.1', seguro: false }));
  assert.ok(paginaConfiavel({ host: 'localhost', seguro: false }));
  assert.equal(paginaConfiavel({ host: 'site.com.br', seguro: false }), false);
  assert.equal(paginaConfiavel({ host: '8.8.8.8', seguro: false }), false);
  assert.equal(tituloDoHost('www.banco.com.br'), 'banco.com.br');
});
