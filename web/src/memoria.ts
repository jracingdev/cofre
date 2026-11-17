export type AreaTransferencia = {
  ler(): Promise<string>;
  escrever(texto: string): Promise<void>;
};

/** Copia e, depois da espera, apaga só se o texto ainda for o nosso. */
export async function copiarELimpar(
  texto: string,
  area: AreaTransferencia,
  esperar: (ms: number) => Promise<void>,
  ms = 45_000,
): Promise<void> {
  await area.escrever(texto);
  await esperar(ms);
  if ((await area.ler()) === texto) await area.escrever('');
}

export function criarVigia(limiteMs: () => number, agora: () => number, aoBloquear: () => void) {
  let ultimo = agora();
  let armado = true;
  return {
    atividade(): void {
      if (armado) ultimo = agora();
    },
    verificar(): void {
      if (!armado) return;
      if (agora() - ultimo >= limiteMs()) {
        armado = false;
        aoBloquear();
      }
    },
    armar(): void {
      armado = true;
      ultimo = agora();
    },
    desarmar(): void {
      armado = false;
    },
  };
}
