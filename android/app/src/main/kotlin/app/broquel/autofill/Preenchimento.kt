package app.broquel.autofill

import android.app.assist.AssistStructure
import android.view.View
import android.view.autofill.AutofillId
import java.net.URI
import java.util.Locale

/** Onde o pedido de preenchimento aconteceu: um site (no navegador) ou um app. */
data class Origem(val dominio: String?, val pacote: String) {
    /** Endereço gravado no item quando o Broquel guarda uma senha nova. */
    val url: String get() = dominio?.let { "https://$it" } ?: "androidapp://$pacote"
    val titulo: String get() = dominio?.removePrefix("www.") ?: pacote
}

data class CamposLogin(
    val usuario: AutofillId?,
    val senha: AutofillId?,
    val valorUsuario: String,
    val valorSenha: String,
    val origem: Origem,
)

object Preenchimento {
    fun ler(estrutura: AssistStructure): CamposLogin {
        val nos = mutableListOf<AssistStructure.ViewNode>()
        for (i in 0 until estrutura.windowNodeCount) percorrer(estrutura.getWindowNodeAt(i).rootViewNode, nos)
        val senha = nos.firstOrNull { it.ehSenha() }
        // Sem dica explícita de usuário, usa o campo de texto que vem logo antes da senha.
        val usuario = nos.firstOrNull { it.ehUsuario() }
            ?: senha?.let { s -> nos.takeWhile { it !== s }.lastOrNull { it.ehTextoEditavel() && !it.ehSenha() } }
        val dominio = nos.firstNotNullOfOrNull { it.webDomain?.takeIf { d -> d.isNotBlank() } }
        return CamposLogin(
            usuario = usuario?.autofillId,
            senha = senha?.autofillId,
            valorUsuario = usuario?.autofillValue?.takeIf { it.isText }?.textValue?.toString().orEmpty(),
            valorSenha = senha?.autofillValue?.takeIf { it.isText }?.textValue?.toString().orEmpty(),
            origem = Origem(dominio?.lowercase(Locale.ROOT), estrutura.activityComponent.packageName),
        )
    }

    /**
     * O item serve para a origem? Site: mesmo domínio ou subdomínio, nos dois sentidos.
     * App: endereço `androidapp://pacote`. Nada de oferecer qualquer senha a qualquer app.
     */
    fun combina(urlItem: String, origem: Origem): Boolean {
        val texto = urlItem.trim().lowercase(Locale.ROOT)
        if (texto.isEmpty()) return false
        if (origem.dominio == null) return texto == "androidapp://${origem.pacote.lowercase(Locale.ROOT)}"
        val host = hostDe(texto) ?: return false
        val pagina = origem.dominio.removePrefix("www.")
        val item = host.removePrefix("www.")
        if (ehSufixoPublico(item) || ehSufixoPublico(pagina)) return false
        return item == pagina || pagina.endsWith(".$item") || item.endsWith(".$pagina")
    }

    /** Sufixos que vários donos compartilham. Um item "com.br" não pode valer para todo site .com.br. */
    private val SUFIXOS = setOf(
        "com.br", "net.br", "org.br", "gov.br", "edu.br", "art.br", "blog.br", "app.br", "dev.br", "eco.br", "ind.br", "inf.br",
        "co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "net.au", "org.au", "co.jp", "ne.jp", "com.ar", "com.mx",
        "co.nz", "com.pt", "co.za", "com.cn", "com.tr", "github.io", "vercel.app", "netlify.app", "pages.dev", "web.app",
        "firebaseapp.com", "herokuapp.com", "blogspot.com", "workers.dev",
    )

    private fun ehSufixoPublico(host: String): Boolean = !host.contains('.') || host in SUFIXOS

    fun hostDe(texto: String): String? {
        val comEsquema = if (texto.contains("://")) texto else "https://$texto"
        return runCatching { URI(comEsquema).host }.getOrNull()?.lowercase(Locale.ROOT)?.takeIf { it.isNotBlank() }
    }

    private fun percorrer(no: AssistStructure.ViewNode, saida: MutableList<AssistStructure.ViewNode>) {
        saida += no
        for (i in 0 until no.childCount) percorrer(no.getChildAt(i), saida)
    }

    private fun AssistStructure.ViewNode.ehTextoEditavel(): Boolean =
        autofillId != null && autofillType == View.AUTOFILL_TYPE_TEXT

    private fun AssistStructure.ViewNode.ehSenha(): Boolean {
        if (!ehTextoEditavel()) return false
        val dicas = autofillHints?.toList().orEmpty().map { it.lowercase(Locale.ROOT) }
        if (dicas.any { "password" in it }) return true
        val variacao = inputType and android.text.InputType.TYPE_MASK_VARIATION
        if (variacao == android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD ||
            variacao == android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
            variacao == android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
        ) return true
        val html = htmlInfo
        return html != null && html.attributes?.any { it.first == "type" && it.second == "password" } == true
    }

    private fun AssistStructure.ViewNode.ehUsuario(): Boolean {
        if (!ehTextoEditavel()) return false
        val dicas = autofillHints?.toList().orEmpty().map { it.lowercase(Locale.ROOT) }
        return dicas.any { "username" in it || "email" in it }
    }
}
