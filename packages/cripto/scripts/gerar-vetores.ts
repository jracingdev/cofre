import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sodium from 'libsodium-wrappers-sumo';
import {
  aadKit,
  aadSenha,
  assinarDesafioComChave,
  cifrarItemComNonce,
  codificarKit,
  derivarChaveEmbrulho,
  derivarChaveMestra,
  embrulharSegredo,
  gerarSenha,
  montarBackup,
  montarCabecalho,
  montarMensagemDesafio,
  PARAMETROS_KDF_TESTE,
  type MetadadosItem,
} from '../src/index.ts';
import { fonteTeste, SEMENTE_VETOR } from '../test/fonte-teste.ts';

const senha = 'correta-cavalo-bateria-broquel';
const senhaNova = 'outra-senha-bem-longa-broquel';
const conteudo = 'senha-do-banco=nao-pode-aparecer';

const sal = deHex('057098662f5dbc4a505ba5943f6ad406');
const cofreId = deHex('627f82edf7feefbe8eb551caa971592e');
const chaveCofre = deHex('ac40fbf893a42f69cf8eb6bc7792c985ce251d5847b52f71736bb06cb379162d');
const sementeAuth = deHex('89d43ac9af6c9b0a6287d8a5a7d91a3fcabcfdc8d6701d0b9a730fae5e520dbf');
const kitSegredo = deHex('bcfdd4bfe2ab554ed7a3ac1951e0ec09de959ffb97cedec517e8a6c4f66ebbc6');
const nonceSenha = deHex('80862529bb23cf0f20aca9593abcbc3e12b0c045a0a42eda');
const nonceKit = deHex('ea20f63f177c13f2ab56f769349a39e78676f5b2efa9ef23');
const itemId = deHex('794a7d138fa0b5cae578284d332fe7c9');
const nonceItem = deHex('65850907dc8840b819a852cd857ae8d9cec53510f1715ceb');
const nonceTumulo = deHex('9f6581b4cec688f93ca5f75ff77c9e883d19632514755ecc');
const desafio = deHex('4bfe4bd40b0714a6e43b6767c4ea4f3245a398949191c3af7be76090a1977f27');
const salNovo = deHex('5afd6adbed13700136846abaee67fa46');
const nonceTroca = deHex('a866c73df42b7643a80f35655a293a10e78501addf78615c');

await sodium.ready;
const par = sodium.crypto_sign_seed_keypair(sementeAuth);
const chaveMestra = await derivarChaveMestra(senha, sal, PARAMETROS_KDF_TESTE);
const embrulho = await derivarChaveEmbrulho(chaveMestra);
const segredo = concatenar(chaveCofre, par.privateKey);
const aadDaSenha = aadSenha(cofreId, PARAMETROS_KDF_TESTE.opslimit, PARAMETROS_KDF_TESTE.memlimit, sal, par.publicKey);
const embrulhoKit = await derivarChaveEmbrulho(kitSegredo);
const wrapSenha = await embrulharSegredo(embrulho, nonceSenha, aadDaSenha, segredo);
const wrapKit = await embrulharSegredo(embrulhoKit, nonceKit, aadKit(cofreId, par.publicKey), segredo);
const cabecalho = montarCabecalho({
  cofreId,
  opslimit: PARAMETROS_KDF_TESTE.opslimit,
  memlimit: PARAMETROS_KDF_TESTE.memlimit,
  salt: sal,
  chavePublicaAutenticacao: par.publicKey,
  segredoEmbrulhadoSenha: wrapSenha,
  segredoEmbrulhadoKit: wrapKit,
});

const itemMeta: MetadadosItem = {
  cofreId,
  itemId,
  revisao: 1,
  criadoEm: 1_700_000_000_000n,
  atualizadoEm: 1_700_000_001_234n,
  apagado: false,
};
const tumuloMeta: MetadadosItem = {
  cofreId,
  itemId,
  revisao: 2,
  criadoEm: 1_700_000_000_000n,
  atualizadoEm: 1_700_000_009_999n,
  apagado: true,
};
const item = await cifrarItemComNonce(chaveCofre, itemMeta, new TextEncoder().encode(conteudo), nonceItem);
const tumulo = await cifrarItemComNonce(chaveCofre, tumuloMeta, new Uint8Array(), nonceTumulo);
const mensagem = montarMensagemDesafio(cofreId, desafio);
const assinatura = await assinarDesafioComChave(par.privateKey, cofreId, desafio);

const chaveNova = await derivarChaveMestra(senhaNova, salNovo, PARAMETROS_KDF_TESTE);
const embrulhoNovo = await derivarChaveEmbrulho(chaveNova);
const wrapNovo = await embrulharSegredo(
  embrulhoNovo,
  nonceTroca,
  aadSenha(cofreId, PARAMETROS_KDF_TESTE.opslimit, PARAMETROS_KDF_TESTE.memlimit, salNovo, par.publicKey),
  segredo,
);
const cabecalhoNovo = montarCabecalho({
  cofreId,
  opslimit: PARAMETROS_KDF_TESTE.opslimit,
  memlimit: PARAMETROS_KDF_TESTE.memlimit,
  salt: salNovo,
  chavePublicaAutenticacao: par.publicKey,
  segredoEmbrulhadoSenha: wrapNovo,
  segredoEmbrulhadoKit: wrapKit,
});
const backup = montarBackup(cabecalho, [item, tumulo]);
const senhaGerada = await gerarSenha({ nivel: 1 }, fonteTeste(SEMENTE_VETOR));

const vetores = {
  versao: 1,
  aviso:
    'Vetores públicos de compatibilidade. A senha é fictícia e o Argon2id está de propósito fraco para o teste ser rápido. Cofre real recusa esses parâmetros.',
  kdf: {
    senha,
    sal_hex: paraHex(sal),
    opslimit: PARAMETROS_KDF_TESTE.opslimit,
    memlimit: PARAMETROS_KDF_TESTE.memlimit,
    chave_mestra_hex: paraHex(chaveMestra),
    chave_embrulho_hex: paraHex(embrulho),
  },
  cofre: {
    cofre_id_hex: paraHex(cofreId),
    chave_cofre_hex: paraHex(chaveCofre),
    semente_auth_hex: paraHex(sementeAuth),
    auth_pk_hex: paraHex(par.publicKey),
    auth_sk_hex: paraHex(par.privateKey),
    kit_segredo_hex: paraHex(kitSegredo),
    nonce_senha_hex: paraHex(nonceSenha),
    nonce_kit_hex: paraHex(nonceKit),
    kit_texto: await codificarKit(kitSegredo),
    cabecalho_hex: paraHex(cabecalho),
  },
  item: {
    item_id_hex: paraHex(itemId),
    revisao: 1,
    criado_em: '1700000000000',
    atualizado_em: '1700000001234',
    apagado: false,
    nonce_hex: paraHex(nonceItem),
    conteudo_utf8: conteudo,
    item_hex: paraHex(item),
  },
  item_apagado: {
    item_id_hex: paraHex(itemId),
    revisao: 2,
    criado_em: '1700000000000',
    atualizado_em: '1700000009999',
    apagado: true,
    nonce_hex: paraHex(nonceTumulo),
    conteudo_utf8: '',
    item_hex: paraHex(tumulo),
  },
  desafio: {
    desafio_hex: paraHex(desafio),
    mensagem_hex: paraHex(mensagem),
    assinatura_hex: paraHex(assinatura),
  },
  troca_senha: {
    senha_nova: senhaNova,
    sal_hex: paraHex(salNovo),
    opslimit: PARAMETROS_KDF_TESTE.opslimit,
    memlimit: PARAMETROS_KDF_TESTE.memlimit,
    nonce_hex: paraHex(nonceTroca),
    cabecalho_hex: paraHex(cabecalhoNovo),
  },
  backup_hex: paraHex(backup),
  gerador: {
    semente_hex: 'c0ffee01',
    nivel: 1,
    comprimento: 16,
    senha: senhaGerada,
  },
};

const destino = resolve(dirname(fileURLToPath(import.meta.url)), '../../../vetores/vetores.json');
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, `${JSON.stringify(vetores, null, 2)}\n`);
console.log(destino);

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
