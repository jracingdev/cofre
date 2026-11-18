package app.broquel

import java.io.File
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Arquivo local cifrado com AES-GCM. A chave fica no Android Keystore. */
class BancoCifrado(private val arquivo: File, private val chave: SecretKey) {
    fun ler(): EstadoBanco {
        if (!arquivo.exists() || arquivo.length() == 0L) return EstadoBanco()
        val tudo = arquivo.readBytes()
        if (tudo.size < 13) return EstadoBanco()
        val iv = tudo.copyOfRange(0, 12)
        val corpo = tudo.copyOfRange(12, tudo.size)
        val cifra = Cipher.getInstance("AES/GCM/NoPadding")
        cifra.init(Cipher.DECRYPT_MODE, chave, GCMParameterSpec(128, iv))
        return estadoDeJson(cifra.doFinal(corpo).toString(Charsets.UTF_8))
    }

    fun apagar() {
        if (arquivo.exists()) arquivo.delete()
    }

    fun gravar(estado: EstadoBanco) {
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val cifra = Cipher.getInstance("AES/GCM/NoPadding")
        cifra.init(Cipher.ENCRYPT_MODE, chave, GCMParameterSpec(128, iv))
        val corpo = cifra.doFinal(estado.paraJson().toByteArray())
        arquivo.parentFile?.mkdirs()
        arquivo.writeBytes(iv + corpo)
    }
}
