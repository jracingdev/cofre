import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import sodium from 'libsodium-wrappers-sumo';
import {
  aadKit,
  aadSenha,
  abrirCofre,
  abrirComKit,
  assinarDesafioComChave,
  cifrarItemComNonce,
  codificarKit,
  decifrarItemComChave,
  derivarChaveEmbrulho,
  derivarChaveMestra,
  embrulharSegredo,
  gerarSenha,
  montarBackup,
  montarCabecalho,
  montarMensagemDesafio,
  idDoNome,
  TAMANHO_CABECALHO,
  type MetadadosItem,
} from '../src/index.ts';
import { fonteTeste } from './fonte-teste.ts';

type Vetores = {
  kdf: {
    senha: string;
    sal_hex: string;
    opslimit: number;
    memlimit: number;
    chave_mestra_hex: string;
    chave_embrulho_hex: string;
  };
  cofre: {
    cofre_id_hex: string;
    chave_cofre_hex: string;
    semente_auth_hex: string;
    auth_pk_hex: string;
    auth_sk_hex: string;
    kit_segredo_hex: string;
    kit_texto: string;
    nonce_senha_hex: string;
    nonce_kit_hex: string;
    cabecalho_hex: string;
  };
  item: ItemVetor;
  item_apagado: ItemVetor;
  desafio: { desafio_hex: string; mensagem_hex: string; assinatura_hex: string };
  troca_senha: {
    senha_nova: string;
    sal_hex: string;
    opslimit: number;
    memlimit: number;
    nonce_hex: string;
    cabecalho_hex: string;
  };
  backup_hex: string;
  gerador: { semente_hex: string; nivel: number; comprimento: number; senha: string };
  nome: { item_id_hex: string };
};

type ItemVetor = {
  item_id_hex: string;
  revisao: number;
  criado_em: string;
  atualizado_em: string;
  apagado: boolean;
  nonce_hex: string;
  conteudo_utf8: string;
  item_hex: string;
};

const vetores = JSON.parse(readFileSync(new URL('../../../vetores/vetores.json', import.meta.url), 'utf8')) as Vetores;

test('os vetores publicados batem com a biblioteca e com o mapa de bytes', async () => {
  const cab = vetores.cofre.cabecalho_hex;
  assert.equal(cab.slice(0, 16), '434f465245010101');
  assert.equal(cab.length / 2, TAMANHO_CABECALHO);
  assert.equal(cab.slice(50, 58), '02000000');
  assert.equal(cab.slice(58, 74), '0020000000000000');
  assert.equal(cab.slice(74, 106), vetores.kdf.sal_hex);
  assert.equal(vetores.item.item_hex.includes(Buffer.from(vetores.item.conteudo_utf8).toString('hex')), false);

  await sodium.ready;
  const parametros = { opslimit: vetores.kdf.opslimit, memlimit: vetores.kdf.memlimit };
  const sal = deHex(vetores.kdf.sal_hex);
  const chaveMestra = await derivarChaveMestra(vetores.kdf.senha, sal, parametros);
  const embrulho = await derivarChaveEmbrulho(chaveMestra);
  assert.equal(paraHex(chaveMestra), vetores.kdf.chave_mestra_hex);
  assert.equal(paraHex(embrulho), vetores.kdf.chave_embrulho_hex);

  const cofreId = deHex(vetores.cofre.cofre_id_hex);
  const chaveCofre = deHex(vetores.cofre.chave_cofre_hex);
  const par = sodium.crypto_sign_seed_keypair(deHex(vetores.cofre.semente_auth_hex));
  assert.equal(paraHex(par.publicKey), vetores.cofre.auth_pk_hex);
  assert.equal(paraHex(par.privateKey), vetores.cofre.auth_sk_hex);
  const segredo = concatenar(chaveCofre, par.privateKey);
  const kitSegredo = deHex(vetores.cofre.kit_segredo_hex);
  const wrapSenha = await embrulharSegredo(
    embrulho,
    deHex(vetores.cofre.nonce_senha_hex),
    aadSenha(cofreId, parametros.opslimit, parametros.memlimit, sal, par.publicKey),
    segredo,
  );
  const wrapKit = await embrulharSegredo(
    await derivarChaveEmbrulho(kitSegredo),
    deHex(vetores.cofre.nonce_kit_hex),
    aadKit(cofreId, par.publicKey),
    segredo,
  );
  const cabecalho = montarCabecalho({
    cofreId,
    opslimit: parametros.opslimit,
    memlimit: parametros.memlimit,
    salt: sal,
    chavePublicaAutenticacao: par.publicKey,
    segredoEmbrulhadoSenha: wrapSenha,
    segredoEmbrulhadoKit: wrapKit,
  });
  assert.equal(paraHex(cabecalho), vetores.cofre.cabecalho_hex);

  const item = await cifrarItemComNonce(
    chaveCofre,
    meta(vetores.item, cofreId),
    new TextEncoder().encode(vetores.item.conteudo_utf8),
    deHex(vetores.item.nonce_hex),
  );
  const tumulo = await cifrarItemComNonce(
    chaveCofre,
    meta(vetores.item_apagado, cofreId),
    new Uint8Array(),
    deHex(vetores.item_apagado.nonce_hex),
  );
  assert.equal(paraHex(item), vetores.item.item_hex);
  assert.equal(paraHex(tumulo), vetores.item_apagado.item_hex);
  assert.equal(new TextDecoder().decode((await decifrarItemComChave(chaveCofre, item)).conteudo), vetores.item.conteudo_utf8);

  const desafio = deHex(vetores.desafio.desafio_hex);
  assert.equal(paraHex(montarMensagemDesafio(cofreId, desafio)), vetores.desafio.mensagem_hex);
  assert.equal(paraHex(await assinarDesafioComChave(par.privateKey, cofreId, desafio)), vetores.desafio.assinatura_hex);

  const salNovo = deHex(vetores.troca_senha.sal_hex);
  const chaveNova = await derivarChaveMestra(vetores.troca_senha.senha_nova, salNovo, parametros);
  const wrapNovo = await embrulharSegredo(
    await derivarChaveEmbrulho(chaveNova),
    deHex(vetores.troca_senha.nonce_hex),
    aadSenha(cofreId, parametros.opslimit, parametros.memlimit, salNovo, par.publicKey),
    segredo,
  );
  const cabecalhoNovo = montarCabecalho({
    cofreId,
    opslimit: parametros.opslimit,
    memlimit: parametros.memlimit,
    salt: salNovo,
    chavePublicaAutenticacao: par.publicKey,
    segredoEmbrulhadoSenha: wrapNovo,
    segredoEmbrulhadoKit: wrapKit,
  });
  assert.equal(paraHex(cabecalhoNovo), vetores.troca_senha.cabecalho_hex);
  assert.equal(paraHex(montarBackup(cabecalho, [item, tumulo])), vetores.backup_hex);

  const sessao = await abrirCofre(cabecalho, vetores.kdf.senha);
  assert.equal(new TextDecoder().decode((await sessao.decifrarItem(item)).conteudo), vetores.item.conteudo_utf8);
  assert.equal(await codificarKit(kitSegredo), vetores.cofre.kit_texto);
  const peloKit = await abrirComKit(cabecalho, vetores.cofre.kit_texto);
  assert.equal(new TextDecoder().decode((await peloKit.decifrarItem(tumulo)).conteudo), '');

  const gerada = await gerarSenha(
    { nivel: vetores.gerador.nivel, comprimento: vetores.gerador.comprimento },
    fonteTeste(Number.parseInt(vetores.gerador.semente_hex, 16)),
  );
  assert.equal(gerada, vetores.gerador.senha);
  assert.equal(paraHex(await idDoNome(cofreId)), vetores.nome.item_id_hex);
});

function meta(item: ItemVetor, cofreId: Uint8Array): MetadadosItem {
  return {
    cofreId,
    itemId: deHex(item.item_id_hex),
    revisao: item.revisao,
    criadoEm: BigInt(item.criado_em),
    atualizadoEm: BigInt(item.atualizado_em),
    apagado: item.apagado,
  };
}

function deHex(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

function paraHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function concatenar(a: Uint8Array, b: Uint8Array): Uint8Array {
  const saida = new Uint8Array(a.length + b.length);
  saida.set(a, 0);
  saida.set(b, a.length);
  return saida;
}
