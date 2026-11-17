package app.broquel

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModelProvider

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        val modelo = ViewModelProvider(this, ViewModelProvider.AndroidViewModelFactory.getInstance(application))[Modelo::class.java]
        lifecycle.addObserver(
            LifecycleEventObserver { _, evento ->
                when (evento) {
                    Lifecycle.Event.ON_START -> modelo.emPrimeiroPlano()
                    Lifecycle.Event.ON_STOP -> modelo.emSegundoPlano()
                    else -> Unit
                }
            },
        )
        setContent { Tema { App(modelo) } }
    }
}
