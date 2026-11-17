export type AcaoConflito = 'adotar-servidor' | 'reenviar-edicao-local' | 'reenviar-edicao-servidor' | 'bifurcar';

/**
 * Regras de docs/SINCRONIZACAO.md, as mesmas do aplicativo.
 * Duas edições não se mesclam, mesmo quando a base local já ficou para trás.
 */
export function decidirConflito(
  localApagado: boolean,
  servidorApagado: boolean,
  cifraIgual: boolean,
  mesmaBase: boolean,
): AcaoConflito {
  if (cifraIgual && localApagado === servidorApagado) return 'adotar-servidor';
  if (localApagado !== servidorApagado) {
    return localApagado ? 'reenviar-edicao-servidor' : 'reenviar-edicao-local';
  }
  if (localApagado && servidorApagado) return 'adotar-servidor';
  void mesmaBase;
  return 'bifurcar';
}
