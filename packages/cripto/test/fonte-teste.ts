import type { FonteUniforme } from '../src/gerador.ts';

/**
 * Gerador só de teste, documentado em docs/GERADOR.md.
 * Não serve para criar senha de verdade. A senha real usa randombytes_uniform.
 * estado = (estado * 1664525 + 1013904223) mod 2^32
 */
export function fonteTeste(semente: number): FonteUniforme {
  let estado = semente >>> 0;
  return (teto: number) => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado % teto;
  };
}

export const SEMENTE_VETOR = 0xc0ffee01;
