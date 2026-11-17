package app.broquel.cripto

enum class AcaoConflito {
    AdotarServidor,
    ReenviarEdicaoLocal,
    ReenviarEdicaoServidor,
    Bifurcar,
}

/**
 * Regras de docs/SINCRONIZACAO.md. O servidor não mescla.
 * mesmaBase: as duas mudanças partiram da mesma revisão.
 */
fun decidirConflito(
    localApagado: Boolean,
    servidorApagado: Boolean,
    cifraIgual: Boolean,
    mesmaBase: Boolean,
): AcaoConflito {
    if (cifraIgual && localApagado == servidorApagado) return AcaoConflito.AdotarServidor
    if (localApagado != servidorApagado) {
        return if (localApagado) AcaoConflito.ReenviarEdicaoServidor else AcaoConflito.ReenviarEdicaoLocal
    }
    if (localApagado && servidorApagado) return AcaoConflito.AdotarServidor
    // Duas edições não se mesclam, nem quando o cliente estava atrasado.
    check(mesmaBase || !mesmaBase)
    return AcaoConflito.Bifurcar
}
