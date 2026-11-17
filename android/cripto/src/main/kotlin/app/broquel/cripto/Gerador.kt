package app.broquel.cripto

data class NivelGerador(
    val nivel: Int,
    val rotulo: String,
    val comprimentoPadrao: Int,
    val comprimentoMinimo: Int,
    val simbolos: Boolean,
)

val NIVEIS_GERADOR = listOf(
    NivelGerador(1, "Básico", 16, 12, false),
    NivelGerador(2, "Forte", 20, 16, true),
    NivelGerador(3, "Alto", 28, 24, true),
    NivelGerador(4, "Militar", 40, 32, true),
)

data class EstadoControles(val nivel: Int, val comprimento: Int)

fun obterNivel(nivel: Int): NivelGerador =
    NIVEIS_GERADOR.find { it.nivel == nivel }
        ?: throw ErroCripto("gerador_invalido", "Nível do gerador inválido.")

fun estadoInicial(): EstadoControles = aoDeslizarNivel(4.0)

fun aoDeslizarNivel(valor: Double): EstadoControles {
    if (!valor.isFinite()) throw ErroCripto("gerador_invalido", "Posição do controle inválida.")
    val nivel = kotlin.math.round(valor).toInt().coerceIn(1, 4)
    val definicao = obterNivel(nivel)
    return EstadoControles(definicao.nivel, definicao.comprimentoPadrao)
}

fun aoDeslizarComprimento(estado: EstadoControles, valor: Double): EstadoControles {
    val definicao = obterNivel(estado.nivel)
    if (!valor.isFinite()) throw ErroCripto("gerador_invalido", "Posição do controle inválida.")
    val pedido = kotlin.math.round(valor).toInt()
    val comprimento = pedido.coerceIn(definicao.comprimentoMinimo, COMPRIMENTO_MAX)
    return estado.copy(comprimento = comprimento)
}

fun entropiaMinimaBits(estado: EstadoControles): Int {
    val classes = classesDe(obterNivel(estado.nivel).simbolos)
    val alfabeto = classes.sumOf { it.length }
    var bits = (estado.comprimento - classes.size) * kotlin.math.log2(alfabeto.toDouble())
    for (classe in classes) bits += kotlin.math.log2(classe.length.toDouble())
    return kotlin.math.floor(bits).toInt()
}

fun gerarSenha(nivel: Int, comprimento: Int? = null, uniforme: (Int) -> Int): String {
    val definicao = obterNivel(nivel)
    val tamanho = comprimento ?: definicao.comprimentoPadrao
    if (tamanho < definicao.comprimentoMinimo || tamanho > COMPRIMENTO_MAX) {
        throw ErroCripto("gerador_invalido", "Comprimento fora da faixa deste nível.")
    }
    val classes = classesDe(definicao.simbolos)
    val alfabeto = classes.joinToString("")
    val caracteres = ArrayList<Char>(tamanho)
    for (classe in classes) caracteres += classe[sortear(uniforme, classe.length)]
    while (caracteres.size < tamanho) caracteres += alfabeto[sortear(uniforme, alfabeto.length)]
    for (i in caracteres.lastIndex downTo 1) {
        val j = sortear(uniforme, i + 1)
        val atual = caracteres[i]
        caracteres[i] = caracteres[j]
        caracteres[j] = atual
    }
    return caracteres.joinToString("")
}

private fun classesDe(simbolos: Boolean): List<String> {
    val filtrar = { alfabeto: String ->
        alfabeto.filter { it !in CARACTERES_AMBIGUOS }
    }
    val classes = mutableListOf(
        filtrar(ALFABETO_MINUSCULAS),
        filtrar(ALFABETO_MAIUSCULAS),
        filtrar(ALFABETO_DIGITOS),
    )
    if (simbolos) classes += filtrar(ALFABETO_SIMBOLOS)
    return classes
}

private fun sortear(uniforme: (Int) -> Int, teto: Int): Int {
    val valor = uniforme(teto)
    if (valor !in 0 until teto) throw ErroCripto("gerador_invalido", "A fonte aleatória devolveu um número fora da faixa.")
    return valor
}

/** Fonte só de teste. Não usar para senha real. */
fun fonteTeste(semente: Long): (Int) -> Int {
    var estado = semente and 0xffffffffL
    return { teto ->
        estado = (estado * 1664525L + 1013904223L) and 0xffffffffL
        (estado % teto).toInt()
    }
}
