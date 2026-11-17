import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  abrirBackup,
  abrirCofre,
  abrirComKit,
  abrirQuadro,
  aadItem,
  aadKit,
  aadSenha,
  COMPRIMENTO_MAX,
  criarBackup,
  criarCofre,
  derivarChaveMestra,
  ErroCofre,
  fecharQuadro,
  MEMLIMIT_PADRAO,
  MEMLIMIT_TETO,
  montarMensagemDesafio,
  OFF_MEMLIMIT,
  OFF_OPSLIMIT,
  OFF_PK,
  OFF_WRAP_KIT,
  OFF_WRAP_SENHA,
  OPSLIMIT_PADRAO,
  PARAMETROS_KDF_TESTE,
  PREFIXO_ITEM,
  TAMANHO_CABECALHO,
  TAMANHO_WRAP,
  u64le,
  verificarAssinaturaDesafio,
  type MetadadosItem,
} from '../src/index.ts';

const SENHA = 'correta-cavalo-bateria-broquel';
const OUTRA = 'outra-senha-bem-longa-broquel';
const CLARO = 'senha-do-banco=nao-pode-aparecer';

function meta(cofreId: Uint8Array, extra: Partial<MetadadosItem> = {}): MetadadosItem {
  return {
    cofreId,
    itemId: extra.itemId ?? crypto.getRandomValues(new Uint8Array(16)),
    revisao: extra.revisao ?? 1,
    criadoEm: extra.criadoEm ?? 1_700_000_000_000n,
    atualizadoEm: extra.atualizadoEm ?? 1_700_000_001_234n,
    apagado: extra.apagado ?? false,
  };
}

test('criar, gravar item e abrir de novo', async () => {
  const criado = await criarCofre(SENHA, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  assert.equal(criado.cabecalho.length, TAMANHO_CABECALHO);
  assert.equal(criado.cabecalho[0], 0x43);
  assert.equal(Buffer.from(criado.cabecalho).toString('utf8').includes(SENHA), false);
  const item = await criado.sessao.cifrarItem(meta(criado.sessao.cofreId), new TextEncoder().encode(CLARO));
  assert.equal(item.length, PREFIXO_ITEM + 1024 + 16);
  assert.equal(Buffer.from(item).toString('utf8').includes(CLARO), false);
  criado.sessao.travar();

  const sessao = await abrirCofre(criado.cabecalho, SENHA);
  const aberto = await sessao.decifrarItem(item);
  assert.equal(new TextDecoder().decode(aberto.conteudo), CLARO);
  assert.equal(aberto.metadados.revisao, 1);
  sessao.travar();
});

test('senha errada não abre', async () => {
  const criado = await criarCofre(SENHA, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  await assert.rejects(abrirCofre(criado.cabecalho, OUTRA), (erro: unknown) => {
    assert.ok(erro instanceof ErroCofre);
    assert.equal(erro.codigo, 'autenticacao_falhou');
    return true;
  });
});

test('adulterar texto cifrado ou metadado faz a abertura falhar', async () => {
  const criado = await criarCofre(SENHA, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  const item = await criado.sessao.cifrarItem(meta(criado.sessao.cofreId), new TextEncoder().encode(CLARO));
  const cifrado = Uint8Array.from(item);
  cifrado[cifrado.length - 1] ^= 0x01;
  const revisao = Uint8Array.from(item);
  revisao[40] ^= 0x01;
  const apagado = Uint8Array.from(item);
  apagado[59] ^= 0x01;
  for (const adulterado of [cifrado, revisao, apagado]) {
    await assert.rejects(criado.sessao.decifrarItem(adulterado), (erro: unknown) => {
      assert.ok(erro instanceof ErroCofre);
      assert.equal(erro.codigo, 'autenticacao_falhou');
      return true;
    });
  }
});

test('trocar a senha mestra não recifra o item e o kit antigo continua valendo', async () => {
  const criado = await criarCofre(SENHA, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  const item = await criado.sessao.cifrarItem(meta(criado.sessao.cofreId), new TextEncoder().encode(CLARO));
  const novo = await criado.sessao.trocarSenhaMestra(criado.cabecalho, OUTRA, {
    parametros: PARAMETROS_KDF_TESTE,
    permitirParametrosFracos: true,
  });
  assert.deepEqual(novo.subarray(OFF_WRAP_KIT), criado.cabecalho.subarray(OFF_WRAP_KIT));
  assert.notDeepEqual(novo.subarray(OFF_WRAP_SENHA, OFF_WRAP_KIT), criado.cabecalho.subarray(OFF_WRAP_SENHA, OFF_WRAP_KIT));
  await assert.rejects(abrirCofre(novo, SENHA), (erro: unknown) => erro instanceof ErroCofre);
  const pelaSenha = await abrirCofre(novo, OUTRA);
  assert.equal(new TextDecoder().decode((await pelaSenha.decifrarItem(item)).conteudo), CLARO);
  const peloKit = await abrirComKit(novo, criado.kitRecuperacao);
  assert.equal(new TextDecoder().decode((await peloKit.decifrarItem(item)).conteudo), CLARO);
  pelaSenha.travar();
  peloKit.travar();
});

test('kit de recuperação abre o cofre e um kit novo invalida o antigo', async () => {
  const criado = await criarCofre(SENHA, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  const item = await criado.sessao.cifrarItem(meta(criado.sessao.cofreId), new TextEncoder().encode(CLARO));
  const peloKit = await abrirComKit(criado.cabecalho, criado.kitRecuperacao);
  assert.equal(new TextDecoder().decode((await peloKit.decifrarItem(item)).conteudo), CLARO);
  const girado = await criado.sessao.girarKitRecuperacao(criado.cabecalho);
  assert.deepEqual(girado.cabecalho.subarray(OFF_WRAP_SENHA, OFF_WRAP_KIT), criado.cabecalho.subarray(OFF_WRAP_SENHA, OFF_WRAP_KIT));
  await assert.rejects(abrirComKit(girado.cabecalho, criado.kitRecuperacao), (erro: unknown) => {
    assert.ok(erro instanceof ErroCofre);
    assert.equal(erro.codigo, 'autenticacao_falhou');
    return true;
  });
  const deNovo = await abrirComKit(girado.cabecalho, girado.kitRecuperacao);
  assert.equal(new TextDecoder().decode((await deNovo.decifrarItem(item)).conteudo), CLARO);
  await assert.rejects(abrirComKit(criado.cabecalho, `${criado.kitRecuperacao}x`), (erro: unknown) => {
    assert.ok(erro instanceof ErroCofre);
    assert.equal(erro.codigo, 'kit_invalido');
    return true;
  });
});

test('tombstone, backup e assinatura de desafio', async () => {
  const criado = await criarCofre(SENHA, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  const id = crypto.getRandomValues(new Uint8Array(16));
  const vivo = await criado.sessao.cifrarItem(
    meta(criado.sessao.cofreId, { itemId: id }),
    new TextEncoder().encode(CLARO),
  );
  const tumulo = await criado.sessao.cifrarItem(
    meta(criado.sessao.cofreId, { itemId: id, revisao: 2, apagado: true, atualizadoEm: 1_700_000_009_999n }),
    new Uint8Array(),
  );
  const lido = await criado.sessao.decifrarItem(tumulo);
  assert.equal(lido.metadados.apagado, true);
  assert.equal(lido.conteudo.length, 0);
  const backup = await criarBackup(criado.sessao, criado.cabecalho, [vivo, tumulo]);
  const restaurado = await abrirBackup(backup, { kit: criado.kitRecuperacao });
  assert.equal(restaurado.itens.length, 2);
  assert.equal(new TextDecoder().decode(restaurado.itens[0]!.aberto.conteudo), CLARO);
  const desafio = crypto.getRandomValues(new Uint8Array(32));
  const assinatura = await criado.sessao.assinarDesafio(desafio);
  assert.equal(assinatura.length, 64);
  assert.equal(
    await verificarAssinaturaDesafio(criado.sessao.chavePublicaAutenticacao, criado.sessao.cofreId, desafio, assinatura),
    true,
  );
  const desafioTrocado = Uint8Array.from(desafio);
  desafioTrocado[0] ^= 1;
  assert.equal(
    await verificarAssinaturaDesafio(
      criado.sessao.chavePublicaAutenticacao,
      criado.sessao.cofreId,
      desafioTrocado,
      assinatura,
    ),
    false,
  );
  const backupAdulterado = Uint8Array.from(backup);
  backupAdulterado[backupAdulterado.length - 1] ^= 1;
  await assert.rejects(abrirBackup(backupAdulterado, { senha: SENHA }), (erro: unknown) => erro instanceof ErroCofre);
});

test('item de outro cofre e sessão travada', async () => {
  const a = await criarCofre(SENHA, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  const b = await criarCofre(OUTRA, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  const idA = a.sessao.cofreId;
  const item = await a.sessao.cifrarItem(meta(idA), new TextEncoder().encode(CLARO));
  await assert.rejects(b.sessao.decifrarItem(item), (erro: unknown) => erro instanceof ErroCofre);
  a.sessao.travar();
  await assert.rejects(a.sessao.cifrarItem(meta(idA), new Uint8Array([1])), (erro: unknown) => {
    assert.ok(erro instanceof ErroCofre);
    assert.equal(erro.codigo, 'estado_invalido');
    return true;
  });
});

test('recusa senha curta, parâmetros fracos e cabeçalho que pede memória demais', async () => {
  await assert.rejects(criarCofre('curta'), (erro: unknown) => {
    assert.ok(erro instanceof ErroCofre);
    assert.equal(erro.codigo, 'senha_recusada');
    return true;
  });
  await assert.rejects(criarCofre(SENHA, { parametros: PARAMETROS_KDF_TESTE }), (erro: unknown) => {
    assert.ok(erro instanceof ErroCofre);
    assert.equal(erro.codigo, 'parametros_fracos');
    return true;
  });
  assert.equal(OPSLIMIT_PADRAO, 4);
  assert.equal(MEMLIMIT_PADRAO, 268_435_456);
  const criado = await criarCofre(SENHA, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true });
  const adulterado = Uint8Array.from(criado.cabecalho);
  adulterado.set(u64le(BigInt(MEMLIMIT_TETO + 1024)), OFF_MEMLIMIT);
  await assert.rejects(abrirCofre(adulterado, SENHA), (erro: unknown) => {
    assert.ok(erro instanceof ErroCofre);
    assert.equal(erro.codigo, 'formato_invalido');
    return true;
  });
  const versao = Uint8Array.from(criado.cabecalho);
  versao[5] = 2;
  await assert.rejects(abrirCofre(versao, SENHA), (erro: unknown) => {
    assert.ok(erro instanceof ErroCofre);
    assert.equal(erro.codigo, 'versao_desconhecida');
    return true;
  });
});

test('mesma senha em NFC deriva a mesma chave', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const composta = await derivarChaveMestra('café-com-leite-bom', salt, PARAMETROS_KDF_TESTE);
  const decomposta = await derivarChaveMestra('cafe\u0301-com-leite-bom', salt, PARAMETROS_KDF_TESTE);
  assert.deepEqual(composta, decomposta);
});

test('preenchimento esconde o tamanho exato e o formato tem os deslocamentos combinados', async () => {
  const curto = fecharQuadro(new Uint8Array(10));
  const medio = fecharQuadro(new Uint8Array(100));
  assert.equal(curto.length, 1024);
  assert.equal(medio.length, 1024);
  assert.equal(abrirQuadro(curto).length, 10);
  curto[20] = 1;
  assert.throws(() => abrirQuadro(curto), (erro: unknown) => erro instanceof ErroCofre);
  const cab = (await criarCofre(SENHA, { parametros: PARAMETROS_KDF_TESTE, permitirParametrosFracos: true })).cabecalho;
  assert.equal(cab.length, TAMANHO_CABECALHO);
  assert.equal(TAMANHO_WRAP, 136);
  assert.equal(OFF_OPSLIMIT, 25);
  assert.equal(OFF_PK, 53);
  assert.equal(OFF_WRAP_SENHA, 85);
  assert.equal(OFF_WRAP_KIT, 221);
  assert.equal(aadSenha(new Uint8Array(16), 2, 8192, new Uint8Array(16), new Uint8Array(32)).length, 85);
  assert.equal(aadKit(new Uint8Array(16), new Uint8Array(32)).length, 56);
  assert.equal(
    aadItem({
      cofreId: new Uint8Array(16),
      itemId: new Uint8Array(16),
      revisao: 1,
      criadoEm: 0n,
      atualizadoEm: 0n,
      apagado: false,
    }).length,
    61,
  );
  assert.equal(montarMensagemDesafio(new Uint8Array(16), new Uint8Array(32)).length, 55);
  assert.equal(COMPRIMENTO_MAX, 128);
});
