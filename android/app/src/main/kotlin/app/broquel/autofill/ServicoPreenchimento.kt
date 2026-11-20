package app.broquel.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveInfo
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import app.broquel.BancoCifrado
import app.broquel.BroquelAplicacao
import app.broquel.GuardaChaves
import app.broquel.MainActivity
import app.broquel.conteudoDe
import app.broquel.ehItemNome
import app.broquel.cripto.SessaoCripto

class ServicoPreenchimento : AutofillService() {
    override fun onFillRequest(request: FillRequest, cancellationSignal: CancellationSignal, callback: FillCallback) {
        val estrutura = request.fillContexts.lastOrNull()?.structure
        if (estrutura == null) {
            callback.onSuccess(null)
            return
        }
        val campos = Preenchimento.ler(estrutura)
        if (campos.senha == null || campos.origem.pacote == packageName) {
            callback.onSuccess(null)
            return
        }
        val sessao = (application as BroquelAplicacao).sessao
        callback.onSuccess(if (sessao == null) respostaTravada(this, campos) else resposta(this, campos, sessao))
    }

    /** O Android já perguntou "Guardar no Broquel?". O app abre com o item preenchido para conferir. */
    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        val estrutura = request.fillContexts.lastOrNull()?.structure
        if (estrutura == null) {
            callback.onSuccess()
            return
        }
        val campos = Preenchimento.ler(estrutura)
        if (campos.valorSenha.isEmpty() || campos.origem.pacote == packageName) {
            callback.onSuccess()
            return
        }
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_GUARDAR, true)
            .putExtra(EXTRA_TITULO, campos.origem.titulo)
            .putExtra(EXTRA_URL, campos.origem.url)
            .putExtra(EXTRA_USUARIO, campos.valorUsuario)
            .putExtra(EXTRA_SENHA, campos.valorSenha)
        val pendente = PendingIntent.getActivity(
            this, 2, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_CANCEL_CURRENT,
        )
        callback.onSuccess(pendente.intentSender)
    }

    companion object {
        const val EXTRA_GUARDAR = "app.broquel.GUARDAR"
        const val EXTRA_TITULO = "app.broquel.TITULO"
        const val EXTRA_URL = "app.broquel.URL"
        const val EXTRA_USUARIO = "app.broquel.USUARIO"
        const val EXTRA_SENHA = "app.broquel.SENHA"
        const val EXTRA_PREENCHER = "app.broquel.PREENCHER"

        private fun ids(campos: CamposLogin): Array<AutofillId> = listOfNotNull(campos.usuario, campos.senha).toTypedArray()

        private fun salvar(campos: CamposLogin): SaveInfo {
            val tipo = if (campos.usuario != null) SaveInfo.SAVE_DATA_TYPE_USERNAME or SaveInfo.SAVE_DATA_TYPE_PASSWORD else SaveInfo.SAVE_DATA_TYPE_PASSWORD
            return SaveInfo.Builder(tipo, arrayOf(campos.senha!!))
                .apply { campos.usuario?.let { setOptionalIds(arrayOf(it)) } }
                .setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE)
                .build()
        }

        private fun linha(contexto: Context, texto: String): RemoteViews =
            RemoteViews(contexto.packageName, android.R.layout.simple_list_item_1).apply {
                setTextViewText(android.R.id.text1, texto)
            }

        /** Cofre travado: um item "Desbloquear Broquel" que abre o app e volta com as senhas do site. */
        fun respostaTravada(contexto: Context, campos: CamposLogin): FillResponse {
            val intent = Intent(contexto, MainActivity::class.java).putExtra(EXTRA_PREENCHER, true)
            val bandeiras = if (Build.VERSION.SDK_INT >= 31) {
                // O sistema acrescenta a estrutura da tela ao intent; por isso ele não pode ser imutável.
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_CANCEL_CURRENT
            } else {
                PendingIntent.FLAG_CANCEL_CURRENT
            }
            val autenticacao: IntentSender = PendingIntent.getActivity(contexto, 1, intent, bandeiras).intentSender
            return FillResponse.Builder()
                .setAuthentication(ids(campos), autenticacao, linha(contexto, "Desbloquear Broquel"))
                .setSaveInfo(salvar(campos))
                .build()
        }

        /** Só as senhas guardadas para este site ou app. */
        fun resposta(contexto: Context, campos: CamposLogin, sessao: SessaoCripto): FillResponse {
            val banco = BancoCifrado(contexto.filesDir.resolve("banco.dat"), GuardaChaves(contexto).chaveDoBanco())
            val estado = runCatching { banco.ler() }.getOrNull()
            val resposta = FillResponse.Builder()
            var algum = false
            estado?.itens?.filter { !it.meta.apagado }?.forEach { item ->
                val bytes = runCatching { sessao.decifrarItem(item.blob).conteudo }.getOrNull() ?: return@forEach
                if (ehItemNome(bytes)) return@forEach
                val conteudo = conteudoDe(bytes)
                if (!Preenchimento.combina(conteudo.url, campos.origem)) return@forEach
                val rotulo = listOf(conteudo.titulo, conteudo.usuario).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "Broquel" }
                val conjunto = Dataset.Builder()
                campos.usuario?.let { conjunto.setValue(it, AutofillValue.forText(conteudo.usuario), linha(contexto, rotulo)) }
                campos.senha?.let { conjunto.setValue(it, AutofillValue.forText(conteudo.senha), linha(contexto, rotulo)) }
                resposta.addDataset(conjunto.build())
                algum = true
            }
            resposta.setSaveInfo(salvar(campos))
            if (!algum) {
                // Sem senha para este lugar: só a oferta de guardar quando o login for enviado.
                return FillResponse.Builder().setSaveInfo(salvar(campos)).build()
            }
            return resposta.build()
        }

        fun estruturaDe(intent: Intent): AssistStructure? =
            if (Build.VERSION.SDK_INT >= 33) {
                intent.getParcelableExtra(android.view.autofill.AutofillManager.EXTRA_ASSIST_STRUCTURE, AssistStructure::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(android.view.autofill.AutofillManager.EXTRA_ASSIST_STRUCTURE)
            }
    }
}
