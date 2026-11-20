package app.broquel

import app.broquel.cripto.AcaoConflito
import app.broquel.cripto.MetadadosItem
import app.broquel.cripto.SessaoCripto
import app.broquel.cripto.bytesParaHex
import app.broquel.cripto.decidirConflito
import org.json.JSONObject
import java.security.SecureRandom
import java.util.Base64

/**
 * @param idDoNome identificador fixo do item com o nome do cofre (`idNome`). Esse item não vira cópia de conflito.
 */
class Sincronizador(private val idDoNome: ByteArray = ByteArray(0)) {
    /** Token da última sincronização. O Sair usa este antes de entrar de novo. */
    var ultimoToken: String? = null
        private set

    /** @param convite código de convite, usado só no primeiro registro do cofre no servidor. */
    fun sincronizar(estado: EstadoBanco, sessao: SessaoCripto, codigoTotp: String?, convite: String? = null): EstadoBanco {
        val base = servidorHttps(estado.url) ?: throw ErroRede("rede", "O servidor precisa ser um endereço https válido.")
        val cliente = ClienteSync(base, pinsDe(estado.pins))
        var atual = estado
        if (atual.aparelhoId.isBlank()) atual = atual.copy(aparelhoId = bytesParaHex(ByteArray(16).also { SecureRandom().nextBytes(it) }))
        if (atual.cofreId.isBlank()) atual = atual.copy(cofreId = cliente.registrar(atual.cabecalho, convite))
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
        ultimoToken = token
        // Só envia o cabeçalho quando ele mudou aqui. Assim um aparelho com cópia antiga não desfaz um kit novo.
        if (atual.cabecalhoPendente) {
            cliente.atualizarCabecalho(token, atual.cabecalho)
            atual = atual.copy(cabecalhoPendente = false)
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

    /**
     * Revoga as sessões deste aparelho. Não envia itens.
     * Usa o token que já existe, se ainda valer: o mesmo código TOTP não vale duas vezes no servidor.
     */
    fun encerrar(estado: EstadoBanco, sessao: SessaoCripto, codigoTotp: String?, tokenAtual: String? = ultimoToken) {
        if (estado.url.isBlank() || estado.cofreId.isBlank()) return
        val base = servidorHttps(estado.url)
            ?: throw ErroRede("rede", "O servidor precisa ser um endereço https válido.")
        val cliente = ClienteSync(base, pinsDe(estado.pins))
        if (!tokenAtual.isNullOrBlank()) {
            try {
                cliente.sair(tokenAtual)
                return
            } catch (erro: ErroRede) {
                if (erro.codigo != "autenticacao_falhou") throw erro
            }
        }
        // Sem identificador, este aparelho nunca entrou: não há sessão dele no servidor.
        if (estado.aparelhoId.isBlank()) return
        val (desafioId, desafio) = cliente.desafio(estado.cofreId)
        val resposta = cliente.responder(desafioId, sessao.assinarDesafio(desafio), estado.aparelhoId)
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
            AcaoConflito.ReenviarEdicaoLocal -> listOf(reenviar(local, remoto, sessao))
            // O nome do cofre tem identificador fixo e não é login: vale a edição mais recente.
            AcaoConflito.Bifurcar -> if (ehNome(local)) {
                if (local.meta.atualizadoEm > remoto.getLong("atualizado_em")) listOf(reenviar(local, remoto, sessao)) else listOf(adotado)
            } else {
                val aberto = sessao.decifrarItem(local.blob)
                val conteudo = conteudoDe(aberto.conteudo).copy(conflitoDe = bytesParaHex(local.meta.itemId))
                val meta = aberto.metadados.copy(
                    itemId = ByteArray(16).also { SecureRandom().nextBytes(it) },
                    revisao = 1,
                    criadoEm = System.currentTimeMillis(),
                    atualizadoEm = System.currentTimeMillis(),
                    apagado = false,
                )
                listOf(adotado, ItemGuardado(meta, sessao.cifrarItem(meta, conteudo.paraBytes()), 0, true, 0))
            }
        }
    }

    private fun ehNome(item: ItemGuardado): Boolean =
        idDoNome.isNotEmpty() && item.meta.itemId.contentEquals(idDoNome)

    private fun reenviar(local: ItemGuardado, remoto: JSONObject, sessao: SessaoCripto): ItemGuardado {
        val aberto = sessao.decifrarItem(local.blob)
        val meta = aberto.metadados.copy(
            revisao = remoto.getInt("revisao") + 1,
            atualizadoEm = System.currentTimeMillis(),
            apagado = local.meta.apagado,
        )
        return local.copy(meta = meta, blob = sessao.cifrarItem(meta, aberto.conteudo), pendente = true, revisaoBase = remoto.getInt("revisao"))
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
