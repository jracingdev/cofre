import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { abrirCofre, criarCofre, PARAMETROS_KDF_TESTE } from '@broquel/cripto';
import { conteudoVazio } from '../../web/src/item.ts';
import { incluirItem, lerConteudo } from '../../web/src/itens.ts';
import type { ItemLocal } from '../../web/src/sincronia.ts';
import {
  abrirSegredo,
  contasDoHost,
  credencialPara,
  guardarSenha,
  listarContas,
  proporGuardar,
  sessaoDoSegredo,
} from '../src/nucleo.ts';

const SENHA = 'correta-cavalo-bateria-broquel';

async function cofreDeTeste() {
  const criado = await criarCofre(SENHA, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  return criado;
}

test('o segredo guardado abre a mesma sessão que a senha mestra', async () => {
  const { cabecalho, sessao: original } = await cofreDeTeste();
  let itens: ItemLocal[] = [];
  itens = await incluirItem(original, itens, { ...conteudoVazio(), titulo: 'Banco', usuario: 'ana', senha: 's1', url: 'https://banco.com.br' }, 1n, randomBytes(16));
  const segredo = await abrirSegredo(cabecalho, SENHA);
  assert.equal(segredo.length, 96);
  const sessao = sessaoDoSegredo(cabecalho, segredo);
  assert.equal((await lerConteudo(sessao, itens[0]!)).senha, 's1');
  // Assina igual à sessão aberta pela senha (o servidor confere com a chave pública do cabeçalho).
  const pelaSenha = await abrirCofre(cabecalho, SENHA);
  const desafio = new Uint8Array(32).fill(7);
  assert.deepEqual(await sessao.assinarDesafio(desafio), await pelaSenha.assinarDesafio(desafio));
  sessao.travar();
  await assert.rejects(() => abrirSegredo(cabecalho, 'errada'));
});

test('guardar: nova, trocar senha do mesmo usuário e ignorar senha igual', async () => {
  const { sessao } = await cofreDeTeste();
  let itens: ItemLocal[] = [];
  const host = 'login.banco.com.br';

  let proposta = await proporGuardar(sessao, itens, host, 'ana', 'velha');
  assert.deepEqual(proposta, { tipo: 'nova' });
  itens = await guardarSenha(sessao, itens, proposta, host, 'ana', 'velha', 1n, randomBytes(16));
  const contas = await listarContas(sessao, itens);
  assert.equal(contas.length, 1);
  assert.equal(contas[0]!.url, 'https://login.banco.com.br');
  assert.equal(contas[0]!.titulo, 'login.banco.com.br');

  assert.deepEqual(await proporGuardar(sessao, itens, host, 'ANA', 'velha'), { tipo: 'igual' });

  proposta = await proporGuardar(sessao, itens, host, 'ana', 'nova');
  assert.equal(proposta.tipo, 'atualizar');
  itens = await guardarSenha(sessao, itens, proposta, host, 'ana', 'nova', 2n, randomBytes(16));
  assert.equal(itens.length, 1);
  assert.equal(itens[0]!.revisao, 2);
  assert.equal(itens[0]!.pendente, true);
  const item = await lerConteudo(sessao, itens[0]!);
  assert.equal(item.senha, 'nova');
  assert.equal(item.usuario, 'ana');

  // Outro usuário no mesmo site vira item novo.
  proposta = await proporGuardar(sessao, itens, host, 'bia', 'x');
  assert.deepEqual(proposta, { tipo: 'nova' });
});

test('a senha só sai para o site certo', async () => {
  const { sessao } = await cofreDeTeste();
  let itens: ItemLocal[] = [];
  itens = await incluirItem(sessao, itens, { ...conteudoVazio(), titulo: 'Banco', usuario: 'ana', senha: 's1', url: 'https://banco.com.br' }, 1n, randomBytes(16));
  itens = await incluirItem(sessao, itens, { ...conteudoVazio(), titulo: 'App', usuario: 'ana', senha: 's2', url: 'androidapp://br.com.banco' }, 1n, randomBytes(16));
  const id = itens[0]!.itemId;
  assert.deepEqual(await credencialPara(sessao, itens, id, 'www.banco.com.br'), { usuario: 'ana', senha: 's1' });
  assert.equal(await credencialPara(sessao, itens, id, 'banco.com.br.golpe.com'), null);
  assert.equal(await credencialPara(sessao, itens, id, 'outrobanco.com.br'), null);
  const contas = await listarContas(sessao, itens);
  assert.equal(contasDoHost(contas, 'banco.com.br').length, 1);
});
