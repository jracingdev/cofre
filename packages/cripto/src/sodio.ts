import sodium from 'libsodium-wrappers-sumo';
import { ErroCofre } from './erros.js';

let pendente: Promise<void> | null = null;

/** Espera o libsodium ficar pronto. As funções públicas já chamam isto. */
export function preparar(): Promise<void> {
  pendente ??= sodium.ready.then(() => undefined);
  return pendente;
}

export { sodium };

export function zerar(...blocos: Array<Uint8Array | null | undefined>): void {
  for (const bloco of blocos) {
    if (bloco && bloco.length > 0) sodium.memzero(bloco);
  }
}

export function segredosIguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return sodium.memcmp(a, b);
}

export function cifrarAead(
  chave: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  claro: Uint8Array,
): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(claro, aad, null, nonce, chave);
}

export function decifrarAead(
  chave: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  cifrado: Uint8Array,
): Uint8Array {
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cifrado, aad, nonce, chave);
  } catch {
    throw new ErroCofre('autenticacao_falhou', 'Não foi possível autenticar os dados.');
  }
}
