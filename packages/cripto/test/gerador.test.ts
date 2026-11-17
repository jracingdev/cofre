import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aoDeslizarComprimento,
  aoDeslizarNivel,
  CARACTERES_AMBIGUOS,
  controles,
  entropiaMinimaBits,
  ErroCofre,
  estadoInicial,
  gerarSenha,
  obterNivel,
} from '../src/index.ts';
import { fonteTeste, SEMENTE_VETOR } from './fonte-teste.ts';

test('os controles começam no nível militar e o comprimento obedece o mínimo', () => {
  const inicial = estadoInicial();
  assert.equal(inicial.nivel, 4);
  assert.equal(inicial.comprimento, 40);
  assert.equal(obterNivel(4).rotulo, 'Militar');
  const [nivel, comprimento] = controles(inicial);
  assert.equal(nivel.id, 'nivel');
  assert.equal(nivel.minimo, 1);
  assert.equal(nivel.maximo, 4);
  assert.equal(nivel.passo, 1);
  assert.equal(nivel.valor, 4);
  assert.deepEqual(nivel.marcas.map((marca) => marca.rotulo), ['Básico', 'Forte', 'Alto', 'Militar']);
  assert.equal(comprimento.minimo, 32);
  assert.equal(comprimento.maximo, 128);
  assert.equal(comprimento.valor, 40);

  const basico = aoDeslizarNivel(1);
  assert.equal(basico.comprimento, 16);
  assert.equal(aoDeslizarComprimento(basico, 8).comprimento, 12);
  assert.equal(aoDeslizarComprimento(basico, 18.2).comprimento, 18);
  assert.equal(aoDeslizarComprimento(inicial, 20).comprimento, 32);
  assert.equal(aoDeslizarComprimento(inicial, 500).comprimento, 128);
  assert.ok(entropiaMinimaBits(inicial) > 200);
  assert.ok(entropiaMinimaBits(basico) > 80);
});

test('cada nível gera senha no tamanho certo, sem caractere ambíguo', async () => {
  for (const nivel of [1, 2, 3, 4] as const) {
    const definicao = obterNivel(nivel);
    const senha = await gerarSenha({ nivel });
    assert.equal(senha.length, definicao.comprimentoPadrao);
    assert.equal([...senha].some((caractere) => CARACTERES_AMBIGUOS.includes(caractere)), false);
    assert.match(senha, /[a-z]/);
    assert.match(senha, /[A-Z]/);
    assert.match(senha, /[2-9]/);
    if (definicao.simbolos) assert.match(senha, /[!#$%*+,\-./:;=?@^_~]/);
    else assert.doesNotMatch(senha, /[!#$%*+,\-./:;=?@^_~]/);
  }
  const longa = await gerarSenha({ nivel: 4, comprimento: 64 });
  assert.equal(longa.length, 64);
  await assert.rejects(gerarSenha({ nivel: 4, comprimento: 20 }), (erro: unknown) => {
    assert.ok(erro instanceof ErroCofre);
    assert.equal(erro.codigo, 'gerador_invalido');
    return true;
  });
});

test('duas senhas seguidas não saem iguais e a fonte de teste é estável', async () => {
  const a = await gerarSenha({ nivel: 2 });
  const b = await gerarSenha({ nivel: 2 });
  assert.notEqual(a, b);
  const primeira = await gerarSenha({ nivel: 1 }, fonteTeste(SEMENTE_VETOR));
  const segunda = await gerarSenha({ nivel: 1 }, fonteTeste(SEMENTE_VETOR));
  assert.equal(primeira, segunda);
  assert.equal(primeira.length, 16);
});
