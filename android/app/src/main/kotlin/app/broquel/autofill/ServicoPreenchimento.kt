package app.broquel.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import app.broquel.BancoCifrado
import app.broquel.BroquelAplicacao
import app.broquel.GuardaChaves
import app.broquel.MainActivity
import app.broquel.conteudoDe
import app.broquel.ehItemNome

class ServicoPreenchimento : AutofillService() {
    override fun onFillRequest(request: FillRequest, cancellationSignal: CancellationSignal, callback: FillCallback) {
        val estrutura = request.fillContexts.lastOrNull()?.structure
        val campos = mutableListOf<AssistStructure.ViewNode>()
        if (estrutura != null) {
            for (i in 0 until estrutura.windowNodeCount) percorrer(estrutura.getWindowNodeAt(i).rootViewNode, campos)
        }
        val usuario = campos.firstOrNull { it.ehUsuario() }
        val senha = campos.firstOrNull { it.ehSenha() }
        if (usuario?.autofillId == null && senha?.autofillId == null) {
            callback.onSuccess(null)
            return
        }
        val sessao = (application as BroquelAplicacao).sessao
        if (sessao == null) {
            val intent = PendingIntent.getActivity(
                this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
            ).intentSender
            val resposta = FillResponse.Builder()
            val conjunto = Dataset.Builder()
            val aviso = RemoteViews(packageName, android.R.layout.simple_list_item_1)
            aviso.setTextViewText(android.R.id.text1, "Desbloquear Broquel")
            usuario?.autofillId?.let { conjunto.setValue(it, AutofillValue.forText(""), aviso).setAuthentication(intent) }
            senha?.autofillId?.let { conjunto.setValue(it, AutofillValue.forText(""), aviso).setAuthentication(intent) }
            resposta.addDataset(conjunto.build())
            callback.onSuccess(resposta.build())
            return
        }
        val banco = BancoCifrado(filesDir.resolve("banco.dat"), GuardaChaves(this).chaveDoBanco())
        val estado = runCatching { banco.ler() }.getOrNull()
        val resposta = FillResponse.Builder()
        estado?.itens?.filter { !it.meta.apagado }?.take(8)?.forEach { item ->
            val bytes = runCatching { sessao.decifrarItem(item.blob).conteudo }.getOrNull() ?: return@forEach
            if (ehItemNome(bytes)) return@forEach
            val conteudo = conteudoDe(bytes)
            val visao = RemoteViews(packageName, android.R.layout.simple_list_item_1)
            visao.setTextViewText(android.R.id.text1, conteudo.titulo.ifBlank { conteudo.usuario })
            val conjunto = Dataset.Builder()
            usuario?.autofillId?.let { conjunto.setValue(it, AutofillValue.forText(conteudo.usuario), visao) }
            senha?.autofillId?.let { conjunto.setValue(it, AutofillValue.forText(conteudo.senha), visao) }
            resposta.addDataset(conjunto.build())
        }
        callback.onSuccess(resposta.build())
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        callback.onSuccess()
    }

    private fun percorrer(no: AssistStructure.ViewNode, saida: MutableList<AssistStructure.ViewNode>) {
        saida += no
        for (i in 0 until no.childCount) percorrer(no.getChildAt(i), saida)
    }

    private fun AssistStructure.ViewNode.ehSenha(): Boolean {
        val dicas = autofillHints?.toList().orEmpty()
        return View.AUTOFILL_HINT_PASSWORD in dicas || (inputType and android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD) != 0
    }

    private fun AssistStructure.ViewNode.ehUsuario(): Boolean {
        val dicas = autofillHints?.toList().orEmpty()
        return View.AUTOFILL_HINT_USERNAME in dicas || View.AUTOFILL_HINT_EMAIL_ADDRESS in dicas
    }
}
