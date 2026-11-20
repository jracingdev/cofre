package app.broquel

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** A chave da biometria sumiu ou foi invalidada por um dedo ou rosto novo. */
class ChaveBioInvalidada : Exception()

class GuardaChaves(private val contexto: Context) {
    private val loja: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun chaveDoBanco(): SecretKey = obterOuCriar(ALIAS_BANCO, biometria = false)

    fun temBiometria(): Boolean = loja.containsAlias(ALIAS_BIO)

    /** O PIN do celular só serve de reserva com chave criptográfica a partir do Android 11. */
    fun aceitaPinDoCelular(): Boolean = Build.VERSION.SDK_INT >= 30

    /** Sempre cria uma chave nova: a anterior pode ser de uma versão sem reserva por PIN. */
    fun prepararBiometria() {
        apagarBiometria()
        obterOuCriar(ALIAS_BIO, biometria = true)
    }

    fun apagarBiometria() {
        if (loja.containsAlias(ALIAS_BIO)) loja.deleteEntry(ALIAS_BIO)
    }

    fun cifraParaEmbrulharBio(): Cipher {
        val cifra = Cipher.getInstance("AES/GCM/NoPadding")
        cifra.init(Cipher.ENCRYPT_MODE, obterOuCriar(ALIAS_BIO, biometria = true))
        return cifra
    }

    /** Lança [ChaveBioInvalidada] quando a chave não existe mais ou foi invalidada. */
    fun cifraParaAbrirBio(iv: ByteArray): Cipher {
        val chave = (loja.getKey(ALIAS_BIO, null) as? SecretKey) ?: throw ChaveBioInvalidada()
        val cifra = Cipher.getInstance("AES/GCM/NoPadding")
        try {
            cifra.init(Cipher.DECRYPT_MODE, chave, GCMParameterSpec(128, iv))
        } catch (_: KeyPermanentlyInvalidatedException) {
            throw ChaveBioInvalidada()
        }
        return cifra
    }

    private fun chave(alias: String): SecretKey = loja.getKey(alias, null) as SecretKey

    private fun obterOuCriar(alias: String, biometria: Boolean): SecretKey {
        if (loja.containsAlias(alias)) return chave(alias)
        val gerador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        val forte = contexto.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        try {
            gerador.init(especificacao(alias, biometria, forte))
            return gerador.generateKey()
        } catch (_: StrongBoxUnavailableException) {
            gerador.init(especificacao(alias, biometria, false))
            return gerador.generateKey()
        }
    }

    private fun especificacao(alias: String, biometria: Boolean, strongBox: Boolean): KeyGenParameterSpec {
        val construtor = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(biometria)
            .setUnlockedDeviceRequired(true)
        if (biometria) {
            construtor.setInvalidatedByBiometricEnrollment(true)
            if (Build.VERSION.SDK_INT >= 30) {
                // Cada uso exige biometria forte (classe 3) ou o PIN/padrão do próprio celular.
                construtor.setUserAuthenticationParameters(
                    0,
                    KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL,
                )
            } else {
                @Suppress("DEPRECATION")
                construtor.setUserAuthenticationValidityDurationSeconds(-1)
            }
        }
        if (strongBox && Build.VERSION.SDK_INT >= 28) {
            construtor.setIsStrongBoxBacked(true)
        }
        return construtor.build()
    }

    companion object {
        const val ALIAS_BANCO = "broquel.banco"
        const val ALIAS_BIO = "broquel.bio"
    }
}
