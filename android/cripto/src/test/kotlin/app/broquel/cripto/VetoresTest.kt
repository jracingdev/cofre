package app.broquel.cripto

import com.goterl.lazysodium.LazySodiumJava
import com.goterl.lazysodium.SodiumJava
import org.json.JSONObject
import java.io.File
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class VetoresTest {
    private val sodium = LazySodiumJava(SodiumJava())
    private val motor = MotorCripto(sodium)

    @Test
    fun vetoresPublicadosBatemComOLibsodium() {
        val json = JSONObject(File("../../vetores/vetores.json").readText())
        val kdf = json.getJSONObject("kdf")
        val cofre = json.getJSONObject("cofre")
        val sal = hexParaBytes(kdf.getString("sal_hex"))
        val mestra = motor.derivarChaveMestra(kdf.getString("senha"), sal, kdf.getInt("opslimit"), kdf.getLong("memlimit"))
        val embrulho = motor.derivarChaveEmbrulho(mestra)
        assertEquals(kdf.getString("chave_mestra_hex"), bytesParaHex(mestra))
        assertEquals(kdf.getString("chave_embrulho_hex"), bytesParaHex(embrulho))

        val pk = ByteArray(32)
        val sk = ByteArray(64)
        assertTrue(sodium.cryptoSignSeedKeypair(pk, sk, hexParaBytes(cofre.getString("semente_auth_hex"))))
        assertEquals(cofre.getString("auth_pk_hex"), bytesParaHex(pk))
        assertEquals(cofre.getString("auth_sk_hex"), bytesParaHex(sk))

        val cofreId = hexParaBytes(cofre.getString("cofre_id_hex"))
        val segredo = concatenar(hexParaBytes(cofre.getString("chave_cofre_hex")), sk)
        val wrapSenha = embrulhar(
            sodium, embrulho, hexParaBytes(cofre.getString("nonce_senha_hex")),
            aadSenha(cofreId, kdf.getInt("opslimit"), kdf.getLong("memlimit"), sal, pk), segredo,
        )
        val kit = hexParaBytes(cofre.getString("kit_segredo_hex"))
        val wrapKit = embrulhar(
            sodium, motor.derivarChaveEmbrulho(kit), hexParaBytes(cofre.getString("nonce_kit_hex")),
            aadKit(cofreId, pk), segredo,
        )
        val cabecalho = montarCabecalho(cofreId, kdf.getInt("opslimit"), kdf.getLong("memlimit"), sal, pk, wrapSenha, wrapKit)
        assertEquals(cofre.getString("cabecalho_hex"), bytesParaHex(cabecalho))
        assertEquals("434f465245010101", cofre.getString("cabecalho_hex").take(16))
        assertEquals(TAMANHO_CABECALHO, cabecalho.size)
        assertEquals(cofre.getString("kit_texto"), motor.codificarKit(kit))

        val item = json.getJSONObject("item")
        val cifrado = cifrarItemComNonce(
            sodium, hexParaBytes(cofre.getString("chave_cofre_hex")),
            meta(item, cofreId), item.getString("conteudo_utf8").toByteArray(),
            hexParaBytes(item.getString("nonce_hex")),
        )
        assertEquals(item.getString("item_hex"), bytesParaHex(cifrado))
        assertEquals(
            item.getString("conteudo_utf8"),
            decifrarItemComChave(sodium, hexParaBytes(cofre.getString("chave_cofre_hex")), cifrado).conteudo.toString(Charsets.UTF_8),
        )

        val desafioJson = json.getJSONObject("desafio")
        val desafio = hexParaBytes(desafioJson.getString("desafio_hex"))
        assertEquals(desafioJson.getString("mensagem_hex"), bytesParaHex(montarMensagemDesafio(cofreId, desafio)))
        val assinatura = ByteArray(64)
        assertTrue(sodium.cryptoSignDetached(assinatura, montarMensagemDesafio(cofreId, desafio), 55, sk))
        assertEquals(desafioJson.getString("assinatura_hex"), bytesParaHex(assinatura))

        val troca = json.getJSONObject("troca_senha")
        val salNovo = hexParaBytes(troca.getString("sal_hex"))
        val mestraNova = motor.derivarChaveMestra(troca.getString("senha_nova"), salNovo, troca.getInt("opslimit"), troca.getLong("memlimit"))
        val wrapNovo = embrulhar(
            sodium, motor.derivarChaveEmbrulho(mestraNova), hexParaBytes(troca.getString("nonce_hex")),
            aadSenha(cofreId, troca.getInt("opslimit"), troca.getLong("memlimit"), salNovo, pk), segredo,
        )
        val cabecalhoNovo = montarCabecalho(cofreId, troca.getInt("opslimit"), troca.getLong("memlimit"), salNovo, pk, wrapNovo, wrapKit)
        assertEquals(troca.getString("cabecalho_hex"), bytesParaHex(cabecalhoNovo))

        val sessao = motor.abrir(cabecalho, kdf.getString("senha"))
        assertEquals(item.getString("conteudo_utf8"), sessao.decifrarItem(cifrado).conteudo.toString(Charsets.UTF_8))
        val peloKit = motor.abrirComKit(cabecalho, cofre.getString("kit_texto"))
        assertContentEquals(ByteArray(0), peloKit.decifrarItem(hexParaBytes(json.getJSONObject("item_apagado").getString("item_hex"))).conteudo)

        val gerador = json.getJSONObject("gerador")
        val senha = gerarSenha(
            gerador.getInt("nivel"),
            gerador.getInt("comprimento"),
            fonteTeste(gerador.getString("semente_hex").toLong(16)),
        )
        assertEquals(gerador.getString("senha"), senha)
    }

    @Test
    fun senhaErradaEAdulteracaoFalham() {
        val criado = motor.criar("correta-cavalo-bateria-broquel", 2, 8192, permitirFracos = true)
        val (cabecalho, kit, sessao) = criado
        val meta = MetadadosItem(sessao.cofreId, sodium.randomBytesBuf(16), 1, 10, 11, false)
        val blob = sessao.cifrarItem(meta, "segredo".toByteArray())
        assertFailsWith<ErroCripto> { motor.abrir(cabecalho, "outra-senha-bem-longa") }
        val ruim = blob.copyOf()
        ruim[ruim.lastIndex] = (ruim[ruim.lastIndex].toInt() xor 1).toByte()
        assertFailsWith<ErroCripto> { sessao.decifrarItem(ruim) }
        assertEquals("segredo", motor.abrirComKit(cabecalho, kit).decifrarItem(blob).conteudo.toString(Charsets.UTF_8))
    }

    @Test
    fun controlesEConflito() {
        assertEquals(4, estadoInicial().nivel)
        assertEquals(40, estadoInicial().comprimento)
        assertEquals(16, aoDeslizarNivel(1.0).comprimento)
        assertEquals(12, aoDeslizarComprimento(aoDeslizarNivel(1.0), 8.0).comprimento)
        assertEquals(32, aoDeslizarComprimento(estadoInicial(), 10.0).comprimento)
        assertEquals(239, entropiaMinimaBits(estadoInicial()))
        assertEquals(AcaoConflito.Bifurcar, decidirConflito(false, false, false, true))
        assertEquals(AcaoConflito.ReenviarEdicaoLocal, decidirConflito(false, true, false, true))
        assertEquals(AcaoConflito.ReenviarEdicaoServidor, decidirConflito(true, false, false, true))
        assertEquals(AcaoConflito.AdotarServidor, decidirConflito(true, true, true, true))
        assertFailsWith<ErroCripto> { gerarSenha(4, 20) { 0 } }
    }

    private fun meta(item: JSONObject, cofreId: ByteArray) = MetadadosItem(
        cofreId,
        hexParaBytes(item.getString("item_id_hex")),
        item.getInt("revisao"),
        item.getString("criado_em").toLong(),
        item.getString("atualizado_em").toLong(),
        item.getBoolean("apagado"),
    )
}
