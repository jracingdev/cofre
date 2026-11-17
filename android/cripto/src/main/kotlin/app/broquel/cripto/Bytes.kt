package app.broquel.cripto

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.text.Normalizer

internal fun concatenar(vararg partes: ByteArray): ByteArray {
    val total = partes.sumOf { it.size }
    val saida = ByteArray(total)
    var cursor = 0
    for (parte in partes) {
        parte.copyInto(saida, cursor)
        cursor += parte.size
    }
    return saida
}

internal fun u32le(valor: Int): ByteArray {
    require(valor >= 0)
    return ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(valor).array()
}

internal fun u64le(valor: Long): ByteArray {
    require(valor >= 0)
    return ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(valor).array()
}

internal fun lerU32(buf: ByteArray, offset: Int): Int =
    ByteBuffer.wrap(buf, offset, 4).order(ByteOrder.LITTLE_ENDIAN).int

internal fun lerU64(buf: ByteArray, offset: Int): Long {
    val valor = ByteBuffer.wrap(buf, offset, 8).order(ByteOrder.LITTLE_ENDIAN).long
    if (valor < 0) throw ErroCripto("formato_invalido", "Inteiro fora da faixa.")
    return valor
}

fun senhaNormalizada(senha: String): ByteArray {
    val nfc = Normalizer.normalize(senha, Normalizer.Form.NFC)
    val pontos = nfc.codePointCount(0, nfc.length)
    if (pontos < SENHA_MIN || pontos > SENHA_MAX) {
        throw ErroCripto("senha_recusada", "A senha precisa ter entre 12 e 256 caracteres.")
    }
    return nfc.toByteArray(Charsets.UTF_8)
}

fun hexParaBytes(hex: String): ByteArray {
    val limpo = hex.lowercase()
    require(limpo.length % 2 == 0)
    return ByteArray(limpo.length / 2) { i -> limpo.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
}

fun bytesParaHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
