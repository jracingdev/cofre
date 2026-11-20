package app.broquel

import android.app.assist.AssistStructure
import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import android.view.autofill.AutofillManager
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import app.broquel.autofill.Preenchimento
import app.broquel.autofill.ServicoPreenchimento
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
    private lateinit var modelo: Modelo

    /** Aberto pelo preenchimento automático com o cofre travado: devolve as senhas ao destravar. */
    private var estruturaParaPreencher: AssistStructure? = null

    override fun onUserInteraction() {
        super.onUserInteraction()
        if (::modelo.isInitialized) modelo.interacao()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        modelo = ViewModelProvider(this, ViewModelProvider.AndroidViewModelFactory.getInstance(application))[Modelo::class.java]
        lifecycle.addObserver(
            LifecycleEventObserver { _, evento ->
                when (evento) {
                    Lifecycle.Event.ON_START -> modelo.emPrimeiroPlano()
                    Lifecycle.Event.ON_STOP -> modelo.emSegundoPlano()
                    else -> Unit
                }
            },
        )
        tratar(intent)
        lifecycleScope.launch {
            modelo.ui.collect { ui ->
                val estrutura = estruturaParaPreencher ?: return@collect
                val sessao = (application as BroquelAplicacao).sessao ?: return@collect
                if (ui.tela != "lista") return@collect
                estruturaParaPreencher = null
                val resposta = ServicoPreenchimento.resposta(this@MainActivity, Preenchimento.ler(estrutura), sessao)
                setResult(RESULT_OK, Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, resposta))
                finish()
            }
        }
        setContent { Tema { App(modelo) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        tratar(intent)
    }

    private fun tratar(intent: Intent?) {
        if (intent == null) return
        if (intent.getBooleanExtra(ServicoPreenchimento.EXTRA_PREENCHER, false)) {
            estruturaParaPreencher = ServicoPreenchimento.estruturaDe(intent)
        }
        if (intent.getBooleanExtra(ServicoPreenchimento.EXTRA_GUARDAR, false)) {
            modelo.receberParaGuardar(
                ConteudoLogin(
                    titulo = intent.getStringExtra(ServicoPreenchimento.EXTRA_TITULO).orEmpty(),
                    usuario = intent.getStringExtra(ServicoPreenchimento.EXTRA_USUARIO).orEmpty(),
                    senha = intent.getStringExtra(ServicoPreenchimento.EXTRA_SENHA).orEmpty(),
                    url = intent.getStringExtra(ServicoPreenchimento.EXTRA_URL).orEmpty(),
                ),
            )
            // Não deixa a senha no intent guardado pela atividade.
            intent.removeExtra(ServicoPreenchimento.EXTRA_SENHA)
            intent.removeExtra(ServicoPreenchimento.EXTRA_GUARDAR)
        }
    }
}
