package app.broquel

import app.broquel.cripto.SessaoCripto
import okhttp3.CertificatePinner
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.Base64
import java.util.concurrent.TimeUnit

class ErroRede(val codigo: String, mensagem: String, val item: JSONObject? = null) : RuntimeException(mensagem)

class ClienteSync(urlBase: String, pins: List<String>) {
    private val base = urlBase.trimEnd('/')
    private val json = "application/json; charset=utf-8".toMediaType()
    private val http: OkHttpClient

    init {
        val construtor = OkHttpClient.Builder()
            .callTimeout(30, TimeUnit.SECONDS)
        val host = base.removePrefix("https://").removePrefix("http://").substringBefore('/').substringBefore(':')
        val validos = pins.map { it.trim() }.filter { it.startsWith("sha256/") }
        if (validos.isNotEmpty() && host.isNotEmpty()) {
            val pinner = CertificatePinner.Builder()
            validos.forEach { pinner.add(host, it) }
            construtor.certificatePinner(pinner.build())
        }
        http = construtor.build()
    }

    fun registrar(cabecalho: ByteArray): String {
        val corpo = JSONObject().put("cabecalho", Base64.getEncoder().encodeToString(cabecalho))
        val resposta = enviar("POST", "/v1/cofre", corpo, null)
        return resposta.getString("cofre_id")
    }

    fun cabecalho(cofreId: String): ByteArray {
        val resposta = enviar("GET", "/v1/cofre/$cofreId", null, null)
        return Base64.getDecoder().decode(resposta.getString("cabecalho"))
    }

    fun atualizarCabecalho(token: String, cabecalho: ByteArray) {
        val corpo = JSONObject().put("cabecalho", Base64.getEncoder().encodeToString(cabecalho))
        enviar("PUT", "/v1/cofre", corpo, token)
    }

    fun desafio(cofreId: String): Pair<String, ByteArray> {
        val corpo = JSONObject().put("cofre_id", cofreId)
        val resposta = enviar("POST", "/v1/auth/desafio", corpo, null)
        return resposta.getString("desafio_id") to Base64.getDecoder().decode(resposta.getString("desafio"))
    }

    fun responder(desafioId: String, assinatura: ByteArray, aparelhoId: String): JSONObject {
        val corpo = JSONObject()
            .put("desafio_id", desafioId)
            .put("assinatura", Base64.getEncoder().encodeToString(assinatura))
            .put("aparelho_id", aparelhoId)
            .put("nome", "Broquel")
        return enviar("POST", "/v1/auth/responder", corpo, null)
    }

    fun totp(preToken: String, codigo: String): String {
        val corpo = JSONObject().put("codigo", codigo)
        return enviar("POST", "/v1/auth/totp", corpo, preToken).getString("token")
    }

    fun itens(token: String, cursor: Long): JSONObject =
        enviar("GET", "/v1/itens?cursor=$cursor&limite=200", null, token)

    fun gravarItem(token: String, itemId: String, base: Int, blob: ByteArray): JSONObject {
        val corpo = JSONObject()
            .put("revisao_base", base)
            .put("blob", Base64.getEncoder().encodeToString(blob))
        return enviar("PUT", "/v1/itens/$itemId", corpo, token)
    }

    private fun enviar(metodo: String, caminho: String, corpo: JSONObject?, token: String?): JSONObject {
        val pedido = Request.Builder().url(base + caminho)
        if (token != null) pedido.header("Authorization", "Bearer $token")
        val body = corpo?.toString()?.toRequestBody(json)
        pedido.method(metodo, if (metodo == "GET") null else body ?: "{}".toRequestBody(json))
        http.newCall(pedido.build()).execute().use { resposta ->
            val texto = resposta.body?.string().orEmpty()
            val jsonResposta = if (texto.isBlank()) JSONObject() else JSONObject(texto)
            if (resposta.code == 409) {
                throw ErroRede("conflito", "Conflito de revisão.", jsonResposta.optJSONObject("item"))
            }
            if (!resposta.isSuccessful) {
                throw ErroRede(jsonResposta.optString("erro", "rede"), jsonResposta.optString("mensagem", "Falha na sincronização."))
            }
            return jsonResposta
        }
    }
}

fun pinsDe(texto: String): List<String> = texto.lines().map { it.trim() }.filter { it.isNotEmpty() }
