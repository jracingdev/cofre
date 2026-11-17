export function paraHex(bytes: Uint8Array): string {
  let texto = '';
  for (const byte of bytes) texto += byte.toString(16).padStart(2, '0');
  return texto;
}

export function deHex(texto: string): Uint8Array {
  const limpo = texto.trim().toLowerCase();
  if (limpo.length % 2 !== 0 || !/^[0-9a-f]+$/.test(limpo)) {
    throw new Error('Identificador inválido.');
  }
  const saida = new Uint8Array(limpo.length / 2);
  for (let i = 0; i < saida.length; i += 1) saida[i] = Number.parseInt(limpo.slice(i * 2, i * 2 + 2), 16);
  return saida;
}

export function paraBase64(bytes: Uint8Array): string {
  let texto = '';
  for (const byte of bytes) texto += String.fromCharCode(byte);
  return btoa(texto);
}

export function deBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const saida = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) saida[i] = binario.charCodeAt(i);
  return saida;
}

export function paraBase64Url(bytes: Uint8Array): string {
  return paraBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function deBase64Url(texto: string): Uint8Array {
  const pad = texto.length % 4 === 0 ? '' : '='.repeat(4 - (texto.length % 4));
  return deBase64(texto.replaceAll('-', '+').replaceAll('_', '/') + pad);
}

export function bytesIguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function bytesAleatorios(tamanho: number): Uint8Array {
  const saida = new Uint8Array(tamanho);
  crypto.getRandomValues(saida);
  return saida;
}
