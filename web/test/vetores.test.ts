import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { abrirCofre } from '@broquel/cripto';
import { bytesAleatorios, deHex, paraHex } from '../src/codec.ts';
import { lerLogin, serializarLogin } from '../src/item.ts';

test('abre o vetor e um login no formato do aplicativo', async () => {
  const vetores = JSON.parse(await readFile(new URL('../../vetores/vetores.json', import.meta.url), 'utf8')) as {
    kdf: { senha: string };
    item: { item_hex: string; conteudo_utf8: string; item_id_hex: string };
    desafio: { desafio_hex: string; assinatura_hex: string };
    cofre: { cabecalho_hex: string };
  };
  const sessao = await abrirCofre(deHex(vetores.cofre.cabecalho_hex), vetores.kdf.senha);
  const segredo = 'senha-do-banco=nao-pode-aparecer';
  try {
    const aberto = await sessao.decifrarItem(deHex(vetores.item.item_hex));
    assert.equal(new TextDecoder().decode(aberto.conteudo), vetores.item.conteudo_utf8);
    assert.equal(paraHex(aberto.metadados.itemId), vetores.item.item_id_hex);
    const assinatura = await sessao.assinarDesafio(deHex(vetores.desafio.desafio_hex));
    assert.equal(paraHex(assinatura), vetores.desafio.assinatura_hex);

    const claro = serializarLogin({
      titulo: 'Banco',
      usuario: 'ana',
      senha: segredo,
      url: 'https://banco',
      notas: '',
      conflitoDe: null,
    });
    const blob = await sessao.cifrarItem({
      cofreId: sessao.cofreId,
      itemId: bytesAleatorios(16),
      revisao: 1,
      criadoEm: 1700000000000n,
      atualizadoEm: 1700000001234n,
      apagado: false,
    }, claro);
    assert.equal(blob[6], 0x02);
    assert.equal(Buffer.from(blob).includes(Buffer.from(segredo)), false);
    assert.equal(lerLogin((await sessao.decifrarItem(blob)).conteudo).senha, segredo);
  } finally {
    sessao.travar();
  }
  await assert.rejects(() => sessao.decifrarItem(deHex(vetores.item.item_hex)));
});
