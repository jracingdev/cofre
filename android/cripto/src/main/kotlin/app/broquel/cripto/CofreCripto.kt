package app.broquel.cripto

import com.goterl.lazysodium.LazySodium
import com.goterl.lazysodium.interfaces.PwHash
import com.sun.jna.NativeLong
import java.util.Arrays
import java.util.Base64

data class MetadadosItem(
    val cofreId: ByteArray,
    val itemId: ByteArray,
    val revisao: Int,
    val criadoEm: Long,
    val atualizadoEm: Long,
    val apagado: Boolean,
)

data class ItemAberto(val metadados: MetadadosItem, val conteudo: ByteArray)

class SessaoCripto(
    val cofreId: ByteArray,
    private val chaveCofre: ByteArray,
    private val authSk: ByteArray,
    val chavePublica: ByteArray,
    private val sodium: LazySodium,
) {
    var travada: Boolean = false
        private set

    fun cifrarItem(meta: MetadadosItem, conteudo: ByteArray): ByteArray {
        exigir()
        if (!meta.cofreId.contentEquals(cofreId)) {
            throw ErroCripto("estado_invalido", "O item não pertence a este cofre.")
        }
        return cifrarItemComNonce(sodium, chaveCofre, meta, conteudo, sodium.randomBytesBuf(NONCE_BYTES))
    }

    fun decifrarItem(blob: ByteArray): ItemAberto {
        exigir()
        return decifrarItemComChave(sodium, chaveCofre, blob)
    }

    fun assinarDesafio(desafio: ByteArray): ByteArray {
        exigir()
        val mensagem = montarMensagemDesafio(cofreId, desafio)
        val assinatura = ByteArray(64)
        if (!sodium.cryptoSignDetached(assinatura, mensagem, mensagem.size.toLong(), authSk)) {
            throw ErroCripto("autenticacao_falhou", "Não foi possível assinar.")
        }
        return assinatura
    }

    fun exportarSegredo(): ByteArray {
        exigir()
        return concatenar(chaveCofre.copyOf(), authSk.copyOf())
    }

    fun travar() {
        if (travada) return
        Arrays.fill(chaveCofre, 0)
        Arrays.fill(authSk, 0)
        travada = true
    }

    private fun exigir() {
        if (travada) throw ErroCripto("estado_invalido", "A sessão está travada.")
    }
}

class MotorCripto(val sodium: LazySodium) {
    fun derivarChaveMestra(senha: String, sal: ByteArray, opslimit: Int, memlimit: Long): ByteArray {
        validarParametros(opslimit, memlimit, criacao = false)
        val bytes = senhaNormalizada(senha)
        return try {
            derivar(bytes, sal, opslimit, memlimit)
        } finally {
            Arrays.fill(bytes, 0)
        }
    }

    fun derivarChaveEmbrulho(chave: ByteArray): ByteArray {
        val sub = ByteArray(32)
        val codigo = sodium.cryptoKdfDeriveFromKey(sub, 32, SUBCHAVE_EMBRULHO, CONTEXTO_KDF.toByteArray(Charsets.US_ASCII), chave)
        if (codigo != 0) throw ErroCripto("formato_invalido", "Falha ao derivar a chave de embrulho.")
        return sub
    }

    fun criar(senha: String, opslimit: Int = OPSLIMIT_PADRAO, memlimit: Long = MEMLIMIT_PADRAO, permitirFracos: Boolean = false): Triple<ByteArray, String, SessaoCripto> {
        validarParametros(opslimit, memlimit, criacao = !permitirFracos)
        val senhaBytes = senhaNormalizada(senha)
        val sal = sodium.randomBytesBuf(16)
        val cofreId = sodium.randomBytesBuf(16)
        val chaveCofre = sodium.randomBytesBuf(32)
        val pk = ByteArray(32)
        val sk = ByteArray(64)
        if (!sodium.cryptoSignKeypair(pk, sk)) throw ErroCripto("formato_invalido", "Falha ao gerar a chave de login.")
        val kit = sodium.randomBytesBuf(32)
        val segredo = concatenar(chaveCofre, sk)
        val mestra = derivar(senhaBytes, sal, opslimit, memlimit)
        val embrulho = derivarChaveEmbrulho(mestra)
        Arrays.fill(mestra, 0)
        val wrapSenha = embrulhar(sodium, embrulho, sodium.randomBytesBuf(24), aadSenha(cofreId, opslimit, memlimit, sal, pk), segredo)
        Arrays.fill(embrulho, 0)
        val embrulhoKit = derivarChaveEmbrulho(kit)
        val wrapKit = embrulhar(sodium, embrulhoKit, sodium.randomBytesBuf(24), aadKit(cofreId, pk), segredo)
        Arrays.fill(embrulhoKit, 0)
        Arrays.fill(segredo, 0)
        Arrays.fill(senhaBytes, 0)
        val cabecalho = montarCabecalho(cofreId, opslimit, memlimit, sal, pk, wrapSenha, wrapKit)
        val texto = codificarKit(kit)
        Arrays.fill(kit, 0)
        return Triple(cabecalho, texto, SessaoCripto(cofreId.copyOf(), chaveCofre, sk, pk, sodium))
    }

    fun abrir(cabecalho: ByteArray, senha: String): SessaoCripto {
        val cab = lerCabecalho(cabecalho)
        val senhaBytes = senhaNormalizada(senha)
        val mestra = derivar(senhaBytes, cab.sal, cab.opslimit, cab.memlimit)
        Arrays.fill(senhaBytes, 0)
        val embrulho = derivarChaveEmbrulho(mestra)
        Arrays.fill(mestra, 0)
        val segredo = desenbrulhar(sodium, embrulho, cab.wrapSenha, aadSenha(cab.cofreId, cab.opslimit, cab.memlimit, cab.sal, cab.pk))
        Arrays.fill(embrulho, 0)
        return sessao(cab, segredo)
    }

    fun abrirComKit(cabecalho: ByteArray, kit: String): SessaoCripto {
        val cab = lerCabecalho(cabecalho)
        val segredoKit = decodificarKit(kit)
        val embrulho = derivarChaveEmbrulho(segredoKit)
        Arrays.fill(segredoKit, 0)
        val segredo = desenbrulhar(sodium, embrulho, cab.wrapKit, aadKit(cab.cofreId, cab.pk))
        Arrays.fill(embrulho, 0)
        return sessao(cab, segredo)
    }

    /**
     * Gera outro kit de recuperação. Copia o embrulho da senha como está e grava um embrulho de kit novo.
     * O formato e o tamanho do cabeçalho (357 bytes) não mudam. O kit antigo deixa de abrir este cabeçalho.
     */
    fun girarKit(cabecalho: ByteArray, sessao: SessaoCripto): Pair<ByteArray, String> {
        val cab = lerCabecalho(cabecalho)
        if (!cab.cofreId.contentEquals(sessao.cofreId) || !segredosIguais(sodium, cab.pk, sessao.chavePublica)) {
            throw ErroCripto("estado_invalido", "O cabeçalho não pertence a esta sessão.")
        }
        val kit = sodium.randomBytesBuf(32)
        val segredo = sessao.exportarSegredo()
        val embrulhoKit = derivarChaveEmbrulho(kit)
        try {
            val wrapKit = embrulhar(sodium, embrulhoKit, sodium.randomBytesBuf(24), aadKit(cab.cofreId, cab.pk), segredo)
            val novo = montarCabecalho(cab.cofreId, cab.opslimit, cab.memlimit, cab.sal, cab.pk, cab.wrapSenha, wrapKit)
            return novo to codificarKit(kit)
        } finally {
            Arrays.fill(embrulhoKit, 0)
            Arrays.fill(segredo, 0)
            Arrays.fill(kit, 0)
        }
    }

    fun codificarKit(segredo: ByteArray): String {
        if (segredo.size != 32) throw ErroCripto("kit_invalido", "Kit de recuperação inválido.")
        val soma = checksum(segredo)
        val encoder = Base64.getUrlEncoder().withoutPadding()
        val texto = PREFIXO_KIT + encoder.encodeToString(segredo) + "." + encoder.encodeToString(soma)
        Arrays.fill(soma, 0)
        return texto
    }

    fun decodificarKit(texto: String): ByteArray {
        val partes = texto.split('.')
        if (partes.size != 3 || partes[0] + "." != PREFIXO_KIT) {
            throw ErroCripto("kit_invalido", "Kit de recuperação inválido.")
        }
        val decoder = Base64.getUrlDecoder()
        val segredo = try {
            decoder.decode(partes[1])
        } catch (_: IllegalArgumentException) {
            throw ErroCripto("kit_invalido", "Kit de recuperação inválido.")
        }
        val informado = try {
            decoder.decode(partes[2])
        } catch (_: IllegalArgumentException) {
            throw ErroCripto("kit_invalido", "Kit de recuperação inválido.")
        }
        val soma = checksum(segredo)
        val confere = segredo.size == 32 && informado.size == 4 && segredosIguais(sodium, soma, informado)
        Arrays.fill(soma, 0)
        Arrays.fill(informado, 0)
        if (!confere) {
            Arrays.fill(segredo, 0)
            throw ErroCripto("kit_invalido", "O kit de recuperação não confere.")
        }
        return segredo
    }

    private fun checksum(segredo: ByteArray): ByteArray {
        val mensagem = concatenar(DOMINIO_KIT.toByteArray(Charsets.US_ASCII), segredo)
        val hash = ByteArray(16)
        if (!sodium.cryptoGenericHash(hash, 16, mensagem, mensagem.size.toLong())) {
            throw ErroCripto("formato_invalido", "Falha no checksum do kit.")
        }
        val soma = hash.copyOf(4)
        Arrays.fill(hash, 0)
        return soma
    }

    private fun derivar(senha: ByteArray, sal: ByteArray, opslimit: Int, memlimit: Long): ByteArray {
        val saida = ByteArray(32)
        val ok = sodium.cryptoPwHash(
            saida, 32, senha, senha.size, sal, opslimit.toLong(), NativeLong(memlimit), PwHash.Alg.PWHASH_ALG_ARGON2ID13,
        )
        if (!ok) throw ErroCripto("formato_invalido", "Falha ao derivar a chave mestra.")
        return saida
    }

    private fun sessao(cab: CabecalhoLido, segredo: ByteArray): SessaoCripto {
        if (segredo.size != SEGREDO_BYTES) throw ErroCripto("formato_invalido", "O segredo do cofre veio com tamanho inesperado.")
        val chave = segredo.copyOfRange(0, 32)
        val sk = segredo.copyOfRange(32, 96)
        val pk = ByteArray(32)
        if (!sodium.cryptoSignEd25519SkToPk(pk, sk) || !segredosIguais(sodium, pk, cab.pk)) {
            throw ErroCripto("autenticacao_falhou", "Não foi possível abrir o cofre.")
        }
        Arrays.fill(segredo, 0)
        return SessaoCripto(cab.cofreId, chave, sk, pk, sodium)
    }
}

internal fun cifrarAead(sodium: LazySodium, chave: ByteArray, nonce: ByteArray, aad: ByteArray, claro: ByteArray): ByteArray {
    val cifrado = ByteArray(claro.size + TAG_BYTES)
    val tamanho = LongArray(1)
    val ok = sodium.cryptoAeadXChaCha20Poly1305IetfEncrypt(
        cifrado, tamanho, claro, claro.size.toLong(), aad, aad.size.toLong(), null, nonce, chave,
    )
    if (!ok) throw ErroCripto("autenticacao_falhou", "Não foi possível cifrar.")
    return cifrado.copyOf(tamanho[0].toInt())
}

internal fun decifrarAead(sodium: LazySodium, chave: ByteArray, nonce: ByteArray, aad: ByteArray, cifrado: ByteArray): ByteArray {
    if (cifrado.size < TAG_BYTES) throw ErroCripto("autenticacao_falhou", "Não foi possível autenticar os dados.")
    val claro = ByteArray(cifrado.size - TAG_BYTES)
    val tamanho = LongArray(1)
    val ok = sodium.cryptoAeadXChaCha20Poly1305IetfDecrypt(
        claro, tamanho, null, cifrado, cifrado.size.toLong(), aad, aad.size.toLong(), nonce, chave,
    )
    if (!ok) throw ErroCripto("autenticacao_falhou", "Não foi possível autenticar os dados.")
    return claro.copyOf(tamanho[0].toInt())
}

fun aadSenha(cofreId: ByteArray, opslimit: Int, memlimit: Long, sal: ByteArray, pk: ByteArray): ByteArray =
    concatenar(
        MAGIC, byteArrayOf(VERSAO_FORMATO.toByte(), TIPO_CABECALHO.toByte(), PROPOSITO_SENHA.toByte()),
        cofreId, byteArrayOf(KDF_ARGON2ID.toByte()), u32le(opslimit), u64le(memlimit), sal, pk,
    )

fun aadKit(cofreId: ByteArray, pk: ByteArray): ByteArray =
    concatenar(MAGIC, byteArrayOf(VERSAO_FORMATO.toByte(), TIPO_CABECALHO.toByte(), PROPOSITO_KIT.toByte()), cofreId, pk)

fun aadItem(meta: MetadadosItem): ByteArray =
    concatenar(MAGIC, byteArrayOf(VERSAO_FORMATO.toByte(), TIPO_ITEM.toByte(), PROPOSITO_ITEM.toByte()), camposItem(meta))

fun montarMensagemDesafio(cofreId: ByteArray, desafio: ByteArray): ByteArray {
    if (cofreId.size != 16 || desafio.size != 32) throw ErroCripto("formato_invalido", "Desafio ou cofre com tamanho inválido.")
    return concatenar(MAGIC, byteArrayOf(VERSAO_FORMATO.toByte(), PROPOSITO_DESAFIO.toByte()), cofreId, desafio)
}

fun montarCabecalho(
    cofreId: ByteArray,
    opslimit: Int,
    memlimit: Long,
    sal: ByteArray,
    pk: ByteArray,
    wrapSenha: ByteArray,
    wrapKit: ByteArray,
): ByteArray {
    validarParametros(opslimit, memlimit, criacao = false)
    val bytes = concatenar(
        MAGIC,
        byteArrayOf(VERSAO_FORMATO.toByte(), TIPO_CABECALHO.toByte(), FLAGS_V1.toByte()),
        cofreId,
        byteArrayOf(KDF_ARGON2ID.toByte()),
        u32le(opslimit),
        u64le(memlimit),
        sal,
        pk,
        wrapSenha,
        wrapKit,
    )
    if (bytes.size != TAMANHO_CABECALHO) throw ErroCripto("formato_invalido", "Cabeçalho com tamanho inesperado.")
    return bytes
}

data class CabecalhoLido(
    val cofreId: ByteArray,
    val opslimit: Int,
    val memlimit: Long,
    val sal: ByteArray,
    val pk: ByteArray,
    val wrapSenha: ByteArray,
    val wrapKit: ByteArray,
)

fun lerCabecalho(bytes: ByteArray): CabecalhoLido {
    if (bytes.size != TAMANHO_CABECALHO || !bytes.copyOfRange(0, 5).contentEquals(MAGIC)) {
        throw ErroCripto("formato_invalido", "Cabeçalho inválido.")
    }
    if (bytes[5].toInt() and 0xff != VERSAO_FORMATO) throw ErroCripto("versao_desconhecida", "Versão de formato não suportada.")
    if (bytes[6].toInt() and 0xff != TIPO_CABECALHO || bytes[7].toInt() and 0xff != FLAGS_V1 || bytes[24].toInt() and 0xff != KDF_ARGON2ID) {
        throw ErroCripto("formato_invalido", "Cabeçalho inválido.")
    }
    val ops = lerU32(bytes, 25)
    val mem = lerU64(bytes, 29)
    validarParametros(ops, mem, criacao = false)
    return CabecalhoLido(
        bytes.copyOfRange(8, 24),
        ops,
        mem,
        bytes.copyOfRange(37, 53),
        bytes.copyOfRange(53, 85),
        bytes.copyOfRange(85, 221),
        bytes.copyOfRange(221, 357),
    )
}

fun embrulhar(sodium: LazySodium, chave: ByteArray, nonce: ByteArray, aad: ByteArray, segredo: ByteArray): ByteArray =
    concatenar(nonce, cifrarAead(sodium, chave, nonce, aad, segredo))

fun desenbrulhar(sodium: LazySodium, chave: ByteArray, blob: ByteArray, aad: ByteArray): ByteArray {
    if (blob.size != TAMANHO_WRAP) throw ErroCripto("formato_invalido", "Embrulho com tamanho inválido.")
    return decifrarAead(sodium, chave, blob.copyOfRange(0, 24), aad, blob.copyOfRange(24, blob.size))
}

fun cifrarItemComNonce(sodium: LazySodium, chave: ByteArray, meta: MetadadosItem, conteudo: ByteArray, nonce: ByteArray): ByteArray {
    if (conteudo.size > MAX_CONTEUDO) throw ErroCripto("limite_excedido", "O item passa do tamanho máximo.")
    val quadro = fecharQuadro(conteudo)
    val cifrado = cifrarAead(sodium, chave, nonce, aadItem(meta), quadro)
    Arrays.fill(quadro, 0)
    return concatenar(MAGIC, byteArrayOf(VERSAO_FORMATO.toByte(), TIPO_ITEM.toByte()), camposItem(meta), nonce, cifrado)
}

fun decifrarItemComChave(sodium: LazySodium, chave: ByteArray, blob: ByteArray): ItemAberto {
    val meta = lerPrefixoItem(blob)
    val quadro = decifrarAead(sodium, chave, blob.copyOfRange(60, 84), aadItem(meta), blob.copyOfRange(84, blob.size))
    val conteudo = abrirQuadro(quadro)
    Arrays.fill(quadro, 0)
    return ItemAberto(meta, conteudo)
}

fun lerPrefixoItem(blob: ByteArray): MetadadosItem {
    if (blob.size < PREFIXO_ITEM + BLOCO + TAG_BYTES || !blob.copyOfRange(0, 5).contentEquals(MAGIC)) {
        throw ErroCripto("formato_invalido", "Item truncado.")
    }
    if (blob[5].toInt() and 0xff != VERSAO_FORMATO) throw ErroCripto("versao_desconhecida", "Versão de formato não suportada.")
    if (blob[6].toInt() and 0xff != TIPO_ITEM) throw ErroCripto("formato_invalido", "Tipo de registro inesperado.")
    val apagado = blob[59].toInt() and 0xff
    if (apagado != 0 && apagado != 1) throw ErroCripto("formato_invalido", "Marca de exclusão inválida.")
    val meta = MetadadosItem(
        blob.copyOfRange(7, 23),
        blob.copyOfRange(23, 39),
        lerU32(blob, 39),
        lerU64(blob, 43),
        lerU64(blob, 51),
        apagado == 1,
    )
    if (meta.revisao < 1) throw ErroCripto("formato_invalido", "Revisão inválida.")
    val cifrado = blob.size - PREFIXO_ITEM
    if (cifrado < BLOCO + TAG_BYTES || (cifrado - TAG_BYTES) % BLOCO != 0) {
        throw ErroCripto("formato_invalido", "Tamanho do texto cifrado inválido.")
    }
    return meta
}

private fun camposItem(meta: MetadadosItem): ByteArray = concatenar(
    meta.cofreId, meta.itemId, u32le(meta.revisao), u64le(meta.criadoEm), u64le(meta.atualizadoEm),
    byteArrayOf(if (meta.apagado) 1 else 0),
)

private fun fecharQuadro(conteudo: ByteArray): ByteArray {
    val bruto = 4 + conteudo.size
    val tamanho = kotlin.math.ceil(bruto / BLOCO.toDouble()).toInt() * BLOCO
    val quadro = ByteArray(tamanho)
    u32le(conteudo.size).copyInto(quadro)
    conteudo.copyInto(quadro, 4)
    return quadro
}

private fun abrirQuadro(quadro: ByteArray): ByteArray {
    if (quadro.size < BLOCO || quadro.size % BLOCO != 0) throw ErroCripto("formato_invalido", "Preenchimento do item inválido.")
    val n = lerU32(quadro, 0)
    if (n > MAX_CONTEUDO || 4 + n > quadro.size) throw ErroCripto("formato_invalido", "Tamanho do conteúdo inválido.")
    for (i in 4 + n until quadro.size) {
        if (quadro[i] != 0.toByte()) throw ErroCripto("formato_invalido", "Preenchimento do item não é canônico.")
    }
    return quadro.copyOfRange(4, 4 + n)
}

internal fun idNome(sodium: LazySodium, cofreId: ByteArray): ByteArray {
    val mensagem = concatenar("cofre.nome.v1".toByteArray(Charsets.US_ASCII), cofreId)
    val hash = ByteArray(16)
    if (!sodium.cryptoGenericHash(hash, 16, mensagem, mensagem.size.toLong())) {
        throw ErroCripto("formato_invalido", "Falha ao derivar o identificador do nome.")
    }
    return hash
}

internal fun segredosIguais(sodium: LazySodium, a: ByteArray, b: ByteArray): Boolean {
    if (a.size != b.size) return false
    return sodium.getSodium().sodium_memcmp(a, b, a.size) == 0
}

internal fun validarParametros(opslimit: Int, memlimit: Long, criacao: Boolean) {
    val faixa = opslimit in 1..OPSLIMIT_TETO && memlimit in 8192..MEMLIMIT_TETO && memlimit % 1024L == 0L
    if (!faixa) {
        throw ErroCripto(if (criacao) "parametros_fracos" else "formato_invalido", "Parâmetros de derivação inválidos.")
    }
    if (criacao && (opslimit < OPSLIMIT_PADRAO || memlimit < MEMLIMIT_PADRAO)) {
        throw ErroCripto("parametros_fracos", "Os parâmetros de derivação estão abaixo do piso de segurança.")
    }
}
