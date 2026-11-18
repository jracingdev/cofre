import { DOMINIO_NOME, ID_BYTES } from './constantes.js';
import { concatenar } from './bytes.js';
import { preparar, sodium } from './sodio.js';

/**
 * Identificador do item que guarda o nome do cofre.
 * É BLAKE2b-128 de `cofre.nome.v1` seguido do identificador do cofre.
 * Os dois aparelhos acham o mesmo item sem o servidor saber o nome.
 */
export async function idDoNome(cofreId: Uint8Array): Promise<Uint8Array> {
  await preparar();
  const mensagem = concatenar(new TextEncoder().encode(DOMINIO_NOME), cofreId);
  return sodium.crypto_generichash(ID_BYTES, mensagem, null);
}
