package app.broquel

import app.broquel.cripto.AcaoConflito
import app.broquel.cripto.MetadadosItem
import app.broquel.cripto.SessaoCripto
import app.broquel.cripto.bytesParaHex
import app.broquel.cripto.decidirConflito
import org.json.JSONObject
import java.security.SecureRandom
import java.util.Base64

class Sincronizador {
    fun sincronizar(estado: EstadoBanco, sessao: SessaoCripto, codigoTotp: String?): EstadoBanco {
        if (estado.url.isBlank()) throw ErroRede("rede", "Informe o endereço do servidor.")
        val cliente = ClienteSync(estado.url, pinsDe(estado.pins))
        var atual = estado
        if (atual.aparelhoId.isBlank()) atual = atual.copy(aparelhoId = bytesParaHex(SecureRandom().generateSeed(16)))
        if (atual.cofreId.isBlank()) atual = atual.copy(cofreId = cliente.registrar(atual.cabecalho))
        val (desafioId, desafio) = cliente.desafio(atual.cofreId)
        val resposta = cliente.responder(desafioId, sessao.assinarDesafio(desafio), atual.aparelhoId)
        val token = if (resposta.optString("estado") == "segundo_fator") {
            if (codigoTotp.isNullOrBlank()) throw ErroRede("segundo_fator", "Informe o código TOTP.")
            if (!resposta.optJSONArray("metodos")?.toString().orEmpty().contains("totp")) {
                throw ErroRede("segundo_fator", "O segundo fator deste cofre não é TOTP.")
            }
            cliente.totp(resposta.getString("pre_token"), codigoTotp)
        } else {
            resposta.getString("token")
        }
        var itens = atual.itens
        repeat(2) {
            val proximos = mutableListOf<ItemGuardado>()
            for (item in itens) {
                if (!item.pendente) {
                    proximos += item
                    continue
                }
                try {
                    val gravado = cliente.gravarItem(token, bytesParaHex(item.meta.itemId), item.revisaoBase, item.blob)
                    proximos += item.copy(
                        pendente = false,
                        cursor = gravado.optLong("cursor", item.cursor),
                        revisaoBase = gravado.optInt("revisao", item.meta.revisao),
                    )
                } catch (erro: ErroRede) {
                    if (erro.codigo != "conflito") throw erro
                    proximos += resolver(item, erro.item, sessao)
                }
            }
            itens = proximos
        }
        var cursor = atual.cursor
        while (true) {
            val pagina = cliente.itens(token, cursor)
            val lista = pagina.optJSONArray("itens") ?: break
            for (i in 0 until lista.length()) {
                val remoto = lista.getJSONObject(i)
                itens = fundir(itens, remoto)
                cursor = maxOf(cursor, remoto.optLong("cursor"))
            }
            if (!pagina.optBoolean("tem_mais")) break
            val proximo = pagina.optLong("proximo_cursor", cursor)
            if (proximo <= cursor && lista.length() == 0) break
            cursor = proximo
        }
        return atual.copy(itens = itens, cursor = cursor)
    }

    /** Abre uma sessão só para revogar as deste aparelho. Não envia itens. */
    fun encerrar(estado: EstadoBanco, sessao: SessaoCripto, codigoTotp: String?) {
        if (estado.url.isBlank() || estado.cofreId.isBlank()) return
        val cliente = ClienteSync(estado.url, pinsDe(estado.pins))
        val aparelho = if (estado.aparelhoId.isBlank()) bytesParaHex(SecureRandom().generateSeed(16)) else estado.aparelhoId
        val (desafioId, desafio) = cliente.desafio(estado.cofreId)
        val resposta = cliente.responder(desafioId, sessao.assinarDesafio(desafio), aparelho)
        val token = if (resposta.optString("estado") == "segundo_fator") {
            if (codigoTotp.isNullOrBlank()) throw ErroRede("segundo_fator", "Informe o código TOTP.")
            if (!resposta.optJSONArray("metodos")?.toString().orEmpty().contains("totp")) {
                throw ErroRede("segundo_fator", "O segundo fator deste cofre não é TOTP.")
            }
            cliente.totp(resposta.getString("pre_token"), codigoTotp)
        } else {
            resposta.getString("token")
        }
        cliente.sair(token)
    }

    private fun resolver(local: ItemGuardado, remoto: JSONObject?, sessao: SessaoCripto): List<ItemGuardado> {
        if (remoto == null) return listOf(local)
        val blobRemoto = Base64.getDecoder().decode(remoto.getString("blob"))
        val igual = local.blob.contentEquals(blobRemoto) && local.meta.apagado == remoto.getBoolean("apagado")
        val mesmaBase = local.revisaoBase + 1 == local.meta.revisao && remoto.getInt("revisao") == local.meta.revisao
        val adotado = remotoParaItem(remoto).copy(pendente = false)
        return when (decidirConflito(local.meta.apagado, remoto.getBoolean("apagado"), igual, mesmaBase)) {
            AcaoConflito.AdotarServidor, AcaoConflito.ReenviarEdicaoServidor -> listOf(adotado)
            AcaoConflito.ReenviarEdicaoLocal -> {
                val aberto = sessao.decifrarItem(local.blob)
                val meta = aberto.metadados.copy(
                    revisao = remoto.getInt("revisao") + 1,
                    atualizadoEm = System.currentTimeMillis(),
                    apagado = false,
                )
                listOf(local.copy(meta = meta, blob = sessao.cifrarItem(meta, aberto.conteudo), pendente = true, revisaoBase = remoto.getInt("revisao")))
            }
            AcaoConflito.Bifurcar -> {
                val aberto = sessao.decifrarItem(local.blob)
                val conteudo = conteudoDe(aberto.conteudo).copy(conflitoDe = bytesParaHex(local.meta.itemId))
                val meta = aberto.metadados.copy(
                    itemId = SecureRandom().generateSeed(16),
                    revisao = 1,
                    criadoEm = System.currentTimeMillis(),
                    atualizadoEm = System.currentTimeMillis(),
                    apagado = false,
                )
                listOf(adotado, ItemGuardado(meta, sessao.cifrarItem(meta, conteudo.paraBytes()), 0, true, 0))
            }
        }
    }

    private fun fundir(itens: List<ItemGuardado>, remoto: JSONObject): List<ItemGuardado> {
        val id = remoto.getString("item_id")
        val atual = itens.find { bytesParaHex(it.meta.itemId) == id }
        val recebido = remotoParaItem(remoto)
        if (atual == null) return itens + recebido
        if (atual.pendente) return itens
        if (recebido.meta.revisao < atual.meta.revisao) return itens
        return itens.map { if (bytesParaHex(it.meta.itemId) == id) recebido else it }
    }

    private fun remotoParaItem(remoto: JSONObject): ItemGuardado {
        val blob = Base64.getDecoder().decode(remoto.getString("blob"))
        return ItemGuardado(
            meta = MetadadosItem(
                cofreId = ByteArray(0),
                itemId = hexParaId(remoto.getString("item_id")),
                revisao = remoto.getInt("revisao"),
                criadoEm = remoto.getLong("criado_em"),
                atualizadoEm = remoto.getLong("atualizado_em"),
                apagado = remoto.getBoolean("apagado"),
            ),
            blob = blob,
            cursor = remoto.optLong("cursor"),
            pendente = false,
            revisaoBase = remoto.getInt("revisao"),
        )
    }
}

private fun hexParaId(hex: String): ByteArray = app.broquel.cripto.hexParaBytes(hex)
