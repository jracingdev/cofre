import { CHECKSUM_KIT_BYTES, CHAVE_BYTES, DOMINIO_KIT, PREFIXO_KIT } from './constantes.js';
import { ErroCofre } from './erros.js';
import { concatenar } from './bytes.js';
import { preparar, segredosIguais, sodium, zerar } from './sodio.js';

function checksum(segredo: Uint8Array): Uint8Array {
  const mensagem = concatenar(new TextEncoder().encode(DOMINIO_KIT), segredo);
  const hash = sodium.crypto_generichash(16, mensagem, null);
  const soma = hash.slice(0, CHECKSUM_KIT_BYTES);
  zerar(hash);
  return soma;
}

/** Texto curto para anotar fora do aparelho. Não vai para o servidor. */
export async function codificarKit(segredo: Uint8Array): Promise<string> {
  await preparar();
  if (segredo.length !== CHAVE_BYTES) {
    throw new ErroCofre('kit_invalido', 'Kit de recuperação inválido.');
  }
  const soma = checksum(segredo);
  try {
    const corpo = sodium.to_base64(segredo, sodium.base64_variants.URLSAFE_NO_PADDING);
    const sufixo = sodium.to_base64(soma, sodium.base64_variants.URLSAFE_NO_PADDING);
    return `${PREFIXO_KIT}${corpo}.${sufixo}`;
  } finally {
    zerar(soma);
  }
}

export async function decodificarKit(texto: string): Promise<Uint8Array> {
  await preparar();
  if (typeof texto !== 'string') {
    throw new ErroCofre('kit_invalido', 'Kit de recuperação inválido.');
  }
  const partes = texto.split('.');
  if (partes.length !== 3 || `${partes[0]}.` !== PREFIXO_KIT) {
    throw new ErroCofre('kit_invalido', 'Kit de recuperação inválido.');
  }
  let segredo: Uint8Array;
  let informado: Uint8Array;
  try {
    segredo = sodium.from_base64(partes[1]!, sodium.base64_variants.URLSAFE_NO_PADDING);
    informado = sodium.from_base64(partes[2]!, sodium.base64_variants.URLSAFE_NO_PADDING);
  } catch {
    throw new ErroCofre('kit_invalido', 'Kit de recuperação inválido.');
  }
  if (segredo.length !== CHAVE_BYTES || informado.length !== CHECKSUM_KIT_BYTES) {
    zerar(segredo, informado);
    throw new ErroCofre('kit_invalido', 'Kit de recuperação inválido.');
  }
  const espera = checksum(segredo);
  const confere = segredosIguais(espera, informado);
  zerar(espera, informado);
  if (!confere) {
    zerar(segredo);
    throw new ErroCofre('kit_invalido', 'O kit de recuperação não confere.');
  }
  return segredo;
}
