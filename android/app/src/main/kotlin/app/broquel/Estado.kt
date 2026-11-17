package app.broquel

import app.broquel.cripto.MetadadosItem
import org.json.JSONArray
import org.json.JSONObject
import java.util.Base64

data class ItemGuardado(
    val meta: MetadadosItem,
    val blob: ByteArray,
    val cursor: Long,
    val pendente: Boolean,
    val revisaoBase: Int,
)

data class EstadoBanco(
    val cofreId: String = "",
    val cabecalho: ByteArray = ByteArray(0),
    val cursor: Long = 0,
    val url: String = "",
    val pins: String = "",
    val aparelhoId: String = "",
    val biometria: Boolean = false,
    val bloqueioSegundos: Int = 60,
    val itens: List<ItemGuardado> = emptyList(),
)

fun EstadoBanco.paraJson(): String {
    val itensJson = JSONArray()
    for (item in itens) {
        itensJson.put(
            JSONObject()
                .put("cofreId", Base64.getEncoder().encodeToString(item.meta.cofreId))
                .put("itemId", Base64.getEncoder().encodeToString(item.meta.itemId))
                .put("revisao", item.meta.revisao)
                .put("criadoEm", item.meta.criadoEm)
                .put("atualizadoEm", item.meta.atualizadoEm)
                .put("apagado", item.meta.apagado)
                .put("blob", Base64.getEncoder().encodeToString(item.blob))
                .put("cursor", item.cursor)
                .put("pendente", item.pendente)
                .put("revisaoBase", item.revisaoBase),
        )
    }
    return JSONObject()
        .put("cofreId", cofreId)
        .put("cabecalho", Base64.getEncoder().encodeToString(cabecalho))
        .put("cursor", cursor)
        .put("url", url)
        .put("pins", pins)
        .put("aparelhoId", aparelhoId)
        .put("biometria", biometria)
        .put("bloqueioSegundos", bloqueioSegundos)
        .put("itens", itensJson)
        .toString()
}

fun estadoDeJson(texto: String): EstadoBanco {
    if (texto.isBlank()) return EstadoBanco()
    val json = JSONObject(texto)
    val itens = json.optJSONArray("itens") ?: JSONArray()
    val lista = buildList {
        for (i in 0 until itens.length()) {
            val item = itens.getJSONObject(i)
            add(
                ItemGuardado(
                    meta = MetadadosItem(
                        Base64.getDecoder().decode(item.getString("cofreId")),
                        Base64.getDecoder().decode(item.getString("itemId")),
                        item.getInt("revisao"),
                        item.getLong("criadoEm"),
                        item.getLong("atualizadoEm"),
                        item.getBoolean("apagado"),
                    ),
                    blob = Base64.getDecoder().decode(item.getString("blob")),
                    cursor = item.getLong("cursor"),
                    pendente = item.getBoolean("pendente"),
                    revisaoBase = item.getInt("revisaoBase"),
                ),
            )
        }
    }
    return EstadoBanco(
        cofreId = json.optString("cofreId"),
        cabecalho = Base64.getDecoder().decode(json.optString("cabecalho", "")),
        cursor = json.optLong("cursor"),
        url = json.optString("url"),
        pins = json.optString("pins"),
        aparelhoId = json.optString("aparelhoId"),
        biometria = json.optBoolean("biometria"),
        bloqueioSegundos = json.optInt("bloqueioSegundos", 60),
        itens = lista,
    )
}

data class ConteudoLogin(
    val titulo: String = "",
    val usuario: String = "",
    val senha: String = "",
    val url: String = "",
    val notas: String = "",
    val conflitoDe: String? = null,
)

fun ConteudoLogin.paraBytes(): ByteArray = JSONObject()
    .put("v", 1)
    .put("tipo", "login")
    .put("titulo", titulo)
    .put("campos", JSONObject().put("usuario", usuario).put("senha", senha).put("url", url).put("notas", notas))
    .put("conflito_de", conflitoDe ?: JSONObject.NULL)
    .toString()
    .toByteArray()

fun conteudoDe(bytes: ByteArray): ConteudoLogin {
    if (bytes.isEmpty()) return ConteudoLogin()
    val json = JSONObject(bytes.toString(Charsets.UTF_8))
    val campos = json.optJSONObject("campos") ?: JSONObject()
    val conflito = if (json.isNull("conflito_de")) null else json.optString("conflito_de")
    return ConteudoLogin(
        titulo = json.optString("titulo"),
        usuario = campos.optString("usuario"),
        senha = campos.optString("senha"),
        url = campos.optString("url"),
        notas = campos.optString("notas"),
        conflitoDe = conflito?.ifBlank { null },
    )
}
