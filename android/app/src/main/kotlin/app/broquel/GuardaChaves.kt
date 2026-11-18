package app.broquel

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class GuardaChaves(private val contexto: Context) {
    private val loja: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun chaveDoBanco(): SecretKey = obterOuCriar("broquel.banco", biometria = false)

    fun temBiometria(): Boolean = loja.containsAlias("broquel.bio")

    /** Apaga a chave biométrica. Usado ao sair do aparelho. */
    fun apagarBiometria() {
        if (loja.containsAlias("broquel.bio")) loja.deleteEntry("broquel.bio")
    }

    fun prepararBiometria() {
        obterOuCriar("broquel.bio", biometria = true)
    }

    fun cifraParaEmbrulharBio(): Cipher {
        val cifra = Cipher.getInstance("AES/GCM/NoPadding")
        cifra.init(Cipher.ENCRYPT_MODE, obterOuCriar("broquel.bio", biometria = true))
        return cifra
    }

    fun cifraParaAbrirBio(iv: ByteArray): Cipher {
        val cifra = Cipher.getInstance("AES/GCM/NoPadding")
        cifra.init(Cipher.DECRYPT_MODE, chave("broquel.bio"), GCMParameterSpec(128, iv))
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
                construtor.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
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
}
