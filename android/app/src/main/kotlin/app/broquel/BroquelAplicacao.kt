package app.broquel

import android.app.Application
import app.broquel.cripto.MotorCripto
import app.broquel.cripto.SessaoCripto
import com.goterl.lazysodium.LazySodiumAndroid
import com.goterl.lazysodium.SodiumAndroid

class BroquelAplicacao : Application() {
    lateinit var motor: MotorCripto
        private set
    @Volatile var sessao: SessaoCripto? = null

    override fun onCreate() {
        super.onCreate()
        instancia = this
        motor = MotorCripto(LazySodiumAndroid(SodiumAndroid()))
    }

    fun travar() {
        sessao?.travar()
        sessao = null
    }

    companion object {
        lateinit var instancia: BroquelAplicacao
    }
}
