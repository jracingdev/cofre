package app.broquel

import java.io.File
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
        File(arquivo.parentFile, arquivo.name + ".tmp").delete()
    }

    /**
     * O Android Keystore não aceita IV escolhido pelo app ao cifrar (Caller-provided IV not permitted).
     * O IV é sorteado pelo próprio Keystore e lido de volta da cifra.
     * A gravação vai para um arquivo temporário e depois troca o nome, para não deixar o banco pela metade.
     */
    @Synchronized
    fun gravar(estado: EstadoBanco) {
        val cifra = Cipher.getInstance("AES/GCM/NoPadding")
        cifra.init(Cipher.ENCRYPT_MODE, chave)
        val iv = cifra.iv
        check(iv != null && iv.size == 12) { "IV inesperado do Keystore." }
        val corpo = cifra.doFinal(estado.paraJson().toByteArray(Charsets.UTF_8))
        arquivo.parentFile?.mkdirs()
        val temporario = File(arquivo.parentFile, arquivo.name + ".tmp")
        temporario.writeBytes(iv + corpo)
        if (!temporario.renameTo(arquivo)) {
            arquivo.writeBytes(iv + corpo)
            temporario.delete()
        }
    }
}
