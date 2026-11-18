package app.broquel

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.PersistableBundle
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.broquel.cripto.ErroCripto
import app.broquel.cripto.EstadoControles
import app.broquel.cripto.MetadadosItem
import app.broquel.cripto.lerCabecalho
import app.broquel.cripto.SessaoCripto
import app.broquel.cripto.aoDeslizarComprimento
import app.broquel.cripto.aoDeslizarNivel
import app.broquel.cripto.entropiaMinimaBits
import app.broquel.cripto.estadoInicial
import app.broquel.cripto.bytesParaHex
import app.broquel.cripto.gerarSenha
import app.broquel.cripto.idNome
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.security.SecureRandom

data class Ui(
    val tela: String = "carregando",
    val ocupado: Boolean = false,
    val erro: String = "",
    val aviso: String = "",
    val kit: String = "",
    val senha: String = "",
    val confirmacao: String = "",
    val itens: List<LinhaItem> = emptyList(),
    val editor: ConteudoLogin = ConteudoLogin(),
    val editandoId: ByteArray? = null,
    val nivel: Int = estadoInicial().nivel,
    val comprimento: Int = estadoInicial().comprimento,
    val senhaGerada: String = "",
    val bits: Int = entropiaMinimaBits(estadoInicial()),
    val url: String = "",
    val pins: String = "",
    val codigoTotp: String = "",
    val biometria: Boolean = false,
    val bloqueioSegundos: Int = 60,
    val identificador: String = "",
    val identificadorRemoto: String = "",
    val nomeCofre: String = "",
    val apelido: String = "",
    val nomeDigitado: String = "",
    val apelidoDigitado: String = "",
    val saidaSemServidor: Boolean = false,
)

data class LinhaItem(val id: ByteArray, val titulo: String, val usuario: String, val conflito: Boolean)

class Modelo(aplicacao: Application) : AndroidViewModel(aplicacao) {
    private val app = aplicacao as BroquelAplicacao
    private val guarda = GuardaChaves(aplicacao)
    private val banco = BancoCifrado(aplicacao.filesDir.resolve("banco.dat"), guarda.chaveDoBanco())
    private var estado = EstadoBanco()
    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui
    private var limparClipboard: Job? = null
    private var bloquear: Job? = null
    private var gravacaoAdiada: Job? = null
    /** Token da última sincronização, só em memória. Some ao travar. */
    private var ultimoToken: String? = null

    init {
        viewModelScope.launch(Dispatchers.IO) {
            estado = runCatching { banco.ler() }.getOrElse { EstadoBanco() }
            val tela = if (estado.cabecalho.isEmpty()) "inicio" else "desbloquear"
            publicar {
                copy(
                    tela = tela,
                    url = estado.url,
                    pins = estado.pins,
                    biometria = estado.biometria,
                    bloqueioSegundos = estado.bloqueioSegundos,
                    identificador = identificadorDe(estado.cabecalho),
                    apelido = estado.apelido,
                )
            }
        }
    }

    fun criar() {
        val senha = _ui.value.senha
        if (senha != _ui.value.confirmacao) {
            publicar { copy(erro = "As senhas não conferem.") }
            return
        }
        trabalhar {
            val (cabecalho, kit, sessao) = app.motor.criar(senha)
            estado = estado.copy(
                cabecalho = cabecalho,
                cofreId = "",
                aparelhoId = bytesParaHex(ByteArray(16).also { SecureRandom().nextBytes(it) }),
                biometria = false,
            )
            app.sessao = sessao
            gravar()
            publicar {
                copy(
                    tela = "kit",
                    kit = kit,
                    senha = "",
                    confirmacao = "",
                    erro = "",
                    identificador = identificadorDe(cabecalho),
                )
            }
        }
    }

    fun desbloquear() {
        val senha = _ui.value.senha
        trabalhar {
            val sessao = app.motor.abrir(estado.cabecalho, senha)
            app.sessao = sessao
            publicar { comoLista(sessao) }
            agendarBloqueio()
        }
    }

    fun pedirBiometria(): Boolean = estado.biometria && guarda.temBiometria()

    fun segredoParaBio(): ByteArray? = app.sessao?.exportarSegredo()

    fun ligarBiometria(cifraPronta: java.util.function.Consumer<javax.crypto.Cipher>) {
        guarda.prepararBiometria()
        cifraPronta.accept(guarda.cifraParaEmbrulharBio())
    }

    fun guardarBio(cifrado: ByteArray) {
        app.filesDir.resolve("bio.dat").writeBytes(cifrado)
        estado = estado.copy(biometria = true)
        if (!gravarNaTela()) return
        publicar { copy(biometria = true, aviso = "Biometria ligada.") }
    }

    fun abrirBio(claro: ByteArray) {
        if (claro.size < 96) {
            publicar { copy(erro = "Não foi possível abrir com biometria.") }
            return
        }
        val cab = lerCabecalho(estado.cabecalho)
        val chave = claro.copyOfRange(0, 32)
        val sk = claro.copyOfRange(32, 96)
        app.sessao = SessaoCripto(cab.cofreId, chave, sk, cab.pk, app.motor.sodium)
        publicar { comoLista(app.sessao!!) }
        agendarBloqueio()
    }

    fun kitGuardado() = publicar { comoLista(app.sessao!!) }

    fun novoItem() = publicar { copy(tela = "editor", editor = ConteudoLogin(), editandoId = null, erro = "") }

    fun editar(linha: LinhaItem) {
        val sessao = app.sessao ?: return
        val item = estado.itens.first { it.meta.itemId.contentEquals(linha.id) }
        val conteudo = conteudoDe(sessao.decifrarItem(item.blob).conteudo)
        publicar { copy(tela = "editor", editor = conteudo, editandoId = linha.id, erro = "") }
    }

    fun salvarEditor() {
        val sessao = app.sessao ?: return
        val editor = _ui.value.editor
        val agora = System.currentTimeMillis()
        val existente = _ui.value.editandoId?.let { id -> estado.itens.first { it.meta.itemId.contentEquals(id) } }
        val meta = if (existente == null) {
            MetadadosItem(sessao.cofreId, ByteArray(16).also { SecureRandom().nextBytes(it) }, 1, agora, agora, false)
        } else {
            existente.meta.copy(revisao = existente.meta.revisao + 1, atualizadoEm = agora, apagado = false)
        }
        val blob = sessao.cifrarItem(meta, editor.copy(conflitoDe = existente?.let { conteudoDe(sessao.decifrarItem(it.blob).conteudo).conflitoDe }).paraBytes())
        val guardado = ItemGuardado(meta, blob, existente?.cursor ?: 0, true, existente?.meta?.revisao ?: 0)
        estado = estado.copy(itens = estado.itens.filterNot { it.meta.itemId.contentEquals(meta.itemId) } + guardado)
        if (!gravarNaTela()) return
        publicar { comoLista(sessao) }
    }

    fun apagarEditor() {
        val sessao = app.sessao ?: return
        val id = _ui.value.editandoId ?: return
        val existente = estado.itens.first { it.meta.itemId.contentEquals(id) }
        val meta = existente.meta.copy(revisao = existente.meta.revisao + 1, atualizadoEm = System.currentTimeMillis(), apagado = true)
        val blob = sessao.cifrarItem(meta, ByteArray(0))
        estado = estado.copy(
            itens = estado.itens.filterNot { it.meta.itemId.contentEquals(id) } +
                ItemGuardado(meta, blob, existente.cursor, true, existente.meta.revisao),
        )
        if (!gravarNaTela()) return
        publicar { comoLista(sessao) }
    }

    /**
     * Copia e limpa depois de 45 segundos. Com `sensivel`, o Android 13+ não mostra o texto
     * na prévia da área de transferência nem o sugere no teclado.
     */
    fun copiar(texto: String, sensivel: Boolean = true) {
        if (texto.isEmpty()) return
        val clipboard = app.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("broquel", texto)
        if (sensivel) {
            clip.description.extras = PersistableBundle().apply {
                putBoolean("android.content.extra.IS_SENSITIVE", true)
            }
        }
        clipboard.setPrimaryClip(clip)
        limparClipboard?.cancel()
        limparClipboard = viewModelScope.launch {
            delay(45_000)
            val atual = clipboard.primaryClip?.getItemAt(0)?.text?.toString()
            if (atual == texto) clipboard.clearPrimaryClip()
        }
        publicar { copy(aviso = "Copiado. A área de transferência será limpa.") }
    }

    fun abrirGerador() {
        val inicial = estadoInicial()
        publicar {
            copy(
                tela = "gerador",
                nivel = inicial.nivel,
                comprimento = inicial.comprimento,
                bits = entropiaMinimaBits(inicial),
                senhaGerada = "",
            )
        }
    }

    fun deslizarNivel(valor: Float) {
        val estadoControle = aoDeslizarNivel(valor.toDouble())
        publicar { copy(nivel = estadoControle.nivel, comprimento = estadoControle.comprimento, bits = entropiaMinimaBits(estadoControle)) }
    }

    fun deslizarComprimento(valor: Float) {
        val estadoControle = aoDeslizarComprimento(EstadoControles(_ui.value.nivel, _ui.value.comprimento), valor.toDouble())
        publicar { copy(comprimento = estadoControle.comprimento, bits = entropiaMinimaBits(estadoControle)) }
    }

    fun gerar() {
        val sodium = app.motor.sodium
        val senha = gerarSenha(_ui.value.nivel, _ui.value.comprimento) { teto -> sodium.randomBytesUniform(teto).toInt() }
        publicar { copy(senhaGerada = senha) }
    }

    /** Gera direto no editor, sem perder o item que está sendo editado. */
    fun gerarParaEditor() {
        val sodium = app.motor.sodium
        val senha = gerarSenha(_ui.value.nivel, _ui.value.comprimento) { teto -> sodium.randomBytesUniform(teto).toInt() }
        publicar { copy(editor = editor.copy(senha = senha), aviso = "Senha gerada. Salve o item para guardar.") }
    }

    fun usarSenhaGerada() {
        publicar { copy(tela = "editor", editor = _ui.value.editor.copy(senha = _ui.value.senhaGerada), editandoId = null) }
    }

    fun abrirAjustes() {
        val sessaoAtual = app.sessao
        publicar {
            copy(
                tela = "ajustes",
                url = estado.url,
                pins = estado.pins,
                bloqueioSegundos = estado.bloqueioSegundos,
                nomeDigitado = if (sessaoAtual != null) nomeAtual(sessaoAtual) else nomeCofre,
                apelidoDigitado = estado.apelido,
            )
        }
    }

    fun definirNomeDigitado(valor: String) = publicar { copy(nomeDigitado = valor) }
    fun definirApelidoDigitado(valor: String) = publicar { copy(apelidoDigitado = valor) }

    fun salvarNome() {
        val sessaoAtual = app.sessao ?: return
        val nome = _ui.value.nomeDigitado.trim()
        // Mesma regra do site (normalizarNome): 40 pontos de código, sem caractere de controle.
        if (nome.codePointCount(0, nome.length) > 40) {
            publicar { copy(erro = "O nome do cofre passa de 40 caracteres.") }
            return
        }
        if (nome.any { it.code < 0x20 }) {
            publicar { copy(erro = "O nome do cofre tem um caractere inválido.") }
            return
        }
        trabalhar {
            val id = idNome(app.motor.sodium, sessaoAtual.cofreId)
            val agora = System.currentTimeMillis()
            val existente = estado.itens.find { it.meta.itemId.contentEquals(id) }
            val meta = if (existente == null) {
                MetadadosItem(sessaoAtual.cofreId, id, 1, agora, agora, nome.isEmpty())
            } else {
                existente.meta.copy(revisao = existente.meta.revisao + 1, atualizadoEm = agora, apagado = nome.isEmpty())
            }
            if (nome.isEmpty() && (existente == null || existente.meta.apagado)) return@trabalhar
            val blob = sessaoAtual.cifrarItem(meta, if (nome.isEmpty()) ByteArray(0) else nomeParaBytes(nome))
            val base = existente?.meta?.revisao ?: 0
            estado = estado.copy(itens = estado.itens.filterNot { it.meta.itemId.contentEquals(id) } + ItemGuardado(meta, blob, existente?.cursor ?: 0, true, base))
            gravar()
            publicar { copy(nomeCofre = nome, aviso = "Nome guardado neste aparelho. Sincronize para o site mostrar o mesmo.") }
        }
    }

    fun salvarApelido() {
        val digitado = _ui.value.apelidoDigitado.trim().filter { it.code >= 0x20 }
        val apelido = digitado.take(digitado.offsetByCodePoints(0, minOf(40, digitado.codePointCount(0, digitado.length))))
        estado = estado.copy(apelido = apelido)
        if (!gravarNaTela()) return
        publicar { copy(apelido = apelido, aviso = "Apelido guardado só neste celular. Ele não vai para o servidor.") }
    }

    fun definirUrl(valor: String) {
        val limpo = valor.trim().take(200)
        estado = estado.copy(url = limpo)
        publicar { copy(url = limpo, erro = "") }
        gravarDepois()
    }

    fun definirIdentificadorRemoto(valor: String) {
        val limpo = valor.lowercase().filter { it.isDigit() || it in 'a'..'f' }.take(32)
        publicar { copy(identificadorRemoto = limpo) }
    }

    fun trazerCofre() {
        trabalhar {
            val id = _ui.value.identificadorRemoto
            if (!id.matches(Regex("^[0-9a-f]{32}$"))) {
                throw ErroRede("formato_invalido", "O identificador tem 32 caracteres hexadecimais.")
            }
            if (estado.url.isBlank()) throw ErroRede("rede", "Informe o endereço do servidor.")
            val cab = ClienteSync(estado.url, pinsDe(estado.pins)).cabecalho(id)
            if (bytesParaHex(lerCabecalho(cab).cofreId) != id) {
                throw ErroRede("formato_invalido", "O cabeçalho não bate com o identificador.")
            }
            estado = estado.copy(cabecalho = cab, cofreId = id, itens = emptyList(), cursor = 0)
            gravar()
            publicar { copy(tela = "desbloquear", identificador = id, aviso = "Cabeçalho recebido. Abra com a senha mestra.", erro = "") }
        }
    }
    fun definirPins(valor: String) {
        val limpo = valor.take(2000)
        estado = estado.copy(pins = limpo)
        publicar { copy(pins = limpo) }
        gravarDepois()
    }

    fun definirBloqueio(segundos: Int) {
        estado = estado.copy(bloqueioSegundos = segundos)
        publicar { copy(bloqueioSegundos = segundos) }
        gravarDepois()
    }
    fun definirCodigo(valor: String) = publicar { copy(codigoTotp = valor.filter { it.isDigit() }.take(6)) }
    fun definirSenha(valor: String) = publicar { copy(senha = valor, erro = "") }
    fun definirConfirmacao(valor: String) = publicar { copy(confirmacao = valor) }
    fun definirEditor(valor: ConteudoLogin) = publicar { copy(editor = valor) }
    fun ir(tela: String) = publicar { copy(tela = tela, erro = "") }

    fun sincronizar() {
        val sessao = app.sessao ?: return
        trabalhar {
            val sincronizador = sincronizadorPara(sessao)
            estado = sincronizador.sincronizar(estado, sessao, _ui.value.codigoTotp.ifBlank { null })
            ultimoToken = sincronizador.ultimoToken
            gravar()
            publicar { comoLista(sessao).copy(aviso = "Sincronizado.") }
        }
    }

    fun pedirSaida() = publicar { copy(tela = "sair", erro = "", saidaSemServidor = false) }

    fun sairDoAparelho(sincronizarAntes: Boolean) {
        val sessaoAtual = app.sessao
        if (sessaoAtual == null) {
            publicar { copy(erro = "Abra o cofre antes de sair.") }
            return
        }
        trabalhar {
            val codigo = _ui.value.codigoTotp.ifBlank { null }
            val sincronizador = sincronizadorPara(sessaoAtual)
            if (sincronizarAntes) {
                estado = sincronizador.sincronizar(estado, sessaoAtual, codigo)
                ultimoToken = sincronizador.ultimoToken
                gravar()
            }
            try {
                sincronizador.encerrar(estado, sessaoAtual, codigo, ultimoToken)
            } catch (erro: ErroRede) {
                if (erro.codigo == "segundo_fator") throw erro
                publicar { copy(saidaSemServidor = true, erro = "O servidor não encerrou a sessão (${erro.message}). Você pode apagar só deste celular.") }
                return@trabalhar
            } catch (erro: Exception) {
                publicar { copy(saidaSemServidor = true, erro = "Sem conexão com o servidor. Você pode apagar só deste celular e revogar a sessão depois, de outro aparelho.") }
                return@trabalhar
            }
            apagarDesteAparelho("Este aparelho saiu do cofre.")
        }
    }

    /** Apaga a cópia local sem falar com o servidor. A sessão deste aparelho continua válida lá até ser revogada. */
    fun sairSoDaqui() {
        trabalhar {
            apagarDesteAparelho("A cópia deste celular foi apagada. Revogue a sessão dele em Ajustes, de outro aparelho.")
        }
    }

    private fun apagarDesteAparelho(aviso: String) {
        app.filesDir.resolve("bio.dat").delete()
        runCatching { guarda.apagarBiometria() }
        banco.apagar()
        estado = EstadoBanco()
        ultimoToken = null
        app.travar()
        publicar {
            copy(
                tela = "inicio",
                itens = emptyList(),
                identificador = "",
                senha = "",
                kit = "",
                nomeCofre = "",
                apelido = "",
                codigoTotp = "",
                aviso = aviso,
                biometria = false,
                saidaSemServidor = false,
            )
        }
    }

    private fun sincronizadorPara(sessao: SessaoCripto): Sincronizador =
        Sincronizador(idNome(app.motor.sodium, sessao.cofreId))

    fun travarAgora() {
        ultimoToken = null
        app.travar()
        publicar { copy(tela = if (estado.cabecalho.isEmpty()) "inicio" else "desbloquear", itens = emptyList(), senha = "") }
    }

    fun emPrimeiroPlano() {
        bloquear?.cancel()
    }

    fun emSegundoPlano() = agendarBloqueio()

    private fun agendarBloqueio() {
        bloquear?.cancel()
        val espera = estado.bloqueioSegundos.coerceAtLeast(15) * 1000L
        bloquear = viewModelScope.launch {
            delay(espera)
            if (app.sessao != null) travarAgora()
        }
    }

    private fun Ui.comoLista(sessao: SessaoCripto): Ui =
        copy(tela = "lista", itens = linhas(sessao), nomeCofre = nomeAtual(sessao), senha = "", erro = "")

    private fun nomeAtual(sessao: SessaoCripto): String {
        val id = idNome(app.motor.sodium, sessao.cofreId)
        val item = estado.itens.find { it.meta.itemId.contentEquals(id) && !it.meta.apagado } ?: return ""
        val bytes = runCatching { sessao.decifrarItem(item.blob).conteudo }.getOrNull() ?: return ""
        return nomeDe(bytes)
    }

    private fun linhas(sessao: SessaoCripto): List<LinhaItem> =
        estado.itens.filter { !it.meta.apagado }.mapNotNull { item ->
            val bytes = runCatching { sessao.decifrarItem(item.blob).conteudo }.getOrElse {
                return@mapNotNull LinhaItem(item.meta.itemId, "Item ilegível", "", false)
            }
            if (ehItemNome(bytes)) return@mapNotNull null
            val conteudo = conteudoDe(bytes)
            LinhaItem(item.meta.itemId, conteudo.titulo.ifBlank { "Sem título" }, conteudo.usuario, conteudo.conflitoDe != null)
        }

    /** Grava a cópia local. Lança em caso de falha: use dentro de `trabalhar`. */
    private fun gravar() {
        gravacaoAdiada?.cancel()
        banco.gravar(estado)
    }

    /** Grava na thread da tela sem derrubar o app. Devolve false e mostra o erro se falhar. */
    private fun gravarNaTela(): Boolean = try {
        gravar()
        true
    } catch (erro: Exception) {
        publicar { copy(erro = "Não foi possível gravar a cópia local neste celular.") }
        false
    }

    /** Campos digitados gravam um pouco depois da última tecla, fora da thread da tela. */
    private fun gravarDepois() {
        gravacaoAdiada?.cancel()
        gravacaoAdiada = viewModelScope.launch(Dispatchers.IO) {
            delay(500)
            try {
                banco.gravar(estado)
            } catch (erro: Exception) {
                publicar { copy(erro = "Não foi possível gravar a cópia local neste celular.") }
            }
        }
    }

    private fun trabalhar(bloco: () -> Unit) {
        publicar { copy(ocupado = true, erro = "") }
        viewModelScope.launch(Dispatchers.Default) {
            try {
                bloco()
            } catch (erro: ErroCripto) {
                publicar { copy(erro = erro.message ?: "Falha.") }
            } catch (erro: ErroRede) {
                publicar { copy(erro = erro.message ?: "Falha de rede.", tela = if (erro.codigo == "segundo_fator") "ajustes" else _ui.value.tela) }
            } catch (erro: Exception) {
                publicar { copy(erro = "Não foi possível concluir.") }
            } finally {
                publicar { copy(ocupado = false) }
            }
        }
    }

    private fun publicar(bloco: Ui.() -> Ui) {
        _ui.value = _ui.value.bloco()
    }

    private fun identificadorDe(cabecalho: ByteArray): String {
        if (cabecalho.isEmpty()) return ""
        return bytesParaHex(lerCabecalho(cabecalho).cofreId)
    }
}

