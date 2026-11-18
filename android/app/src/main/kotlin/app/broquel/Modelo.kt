package app.broquel

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
                aparelhoId = bytesParaHex(SecureRandom().generateSeed(16)),
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
            publicar { copy(tela = "lista", senha = "", erro = "", itens = linhas(sessao)) }
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
        gravar()
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
        publicar { copy(tela = "lista", erro = "", itens = linhas(app.sessao!!)) }
        agendarBloqueio()
    }

    fun kitGuardado() = publicar { copy(tela = "lista", itens = linhas(app.sessao!!)) }

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
            MetadadosItem(sessao.cofreId, SecureRandom().generateSeed(16), 1, agora, agora, false)
        } else {
            existente.meta.copy(revisao = existente.meta.revisao + 1, atualizadoEm = agora, apagado = false)
        }
        val blob = sessao.cifrarItem(meta, editor.copy(conflitoDe = existente?.let { conteudoDe(sessao.decifrarItem(it.blob).conteudo).conflitoDe }).paraBytes())
        val guardado = ItemGuardado(meta, blob, existente?.cursor ?: 0, true, existente?.meta?.revisao ?: 0)
        estado = estado.copy(itens = estado.itens.filterNot { it.meta.itemId.contentEquals(meta.itemId) } + guardado)
        gravar()
        publicar { copy(tela = "lista", itens = linhas(sessao), erro = "") }
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
        gravar()
        publicar { copy(tela = "lista", itens = linhas(sessao)) }
    }

    fun copiar(texto: String) {
        val clipboard = app.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("broquel", texto))
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

    fun usarSenhaGerada() {
        publicar { copy(tela = "editor", editor = _ui.value.editor.copy(senha = _ui.value.senhaGerada), editandoId = null) }
    }

    fun abrirAjustes() = publicar { copy(tela = "ajustes", url = estado.url, pins = estado.pins, bloqueioSegundos = estado.bloqueioSegundos) }

    fun definirUrl(valor: String) { estado = estado.copy(url = valor); gravar(); publicar { copy(url = valor) } }

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
    fun definirPins(valor: String) { estado = estado.copy(pins = valor); gravar(); publicar { copy(pins = valor) } }
    fun definirBloqueio(segundos: Int) { estado = estado.copy(bloqueioSegundos = segundos); gravar(); publicar { copy(bloqueioSegundos = segundos) } }
    fun definirCodigo(valor: String) = publicar { copy(codigoTotp = valor.filter { it.isDigit() }.take(6)) }
    fun definirSenha(valor: String) = publicar { copy(senha = valor, erro = "") }
    fun definirConfirmacao(valor: String) = publicar { copy(confirmacao = valor) }
    fun definirEditor(valor: ConteudoLogin) = publicar { copy(editor = valor) }
    fun ir(tela: String) = publicar { copy(tela = tela, erro = "") }

    fun sincronizar() {
        val sessao = app.sessao ?: return
        trabalhar {
            estado = Sincronizador().sincronizar(estado, sessao, _ui.value.codigoTotp.ifBlank { null })
            gravar()
            publicar { copy(tela = "lista", aviso = "Sincronizado.", itens = linhas(sessao), erro = "") }
        }
    }

    fun pedirSaida() = publicar { copy(tela = "sair", erro = "") }

    fun sairDoAparelho(sincronizarAntes: Boolean) {
        val sessaoAtual = app.sessao
        if (sessaoAtual == null) {
            publicar { copy(erro = "Abra o cofre antes de sair.") }
            return
        }
        trabalhar {
            if (sincronizarAntes) {
                estado = Sincronizador().sincronizar(estado, sessaoAtual, _ui.value.codigoTotp.ifBlank { null })
                gravar()
            }
            Sincronizador().encerrar(estado, sessaoAtual, _ui.value.codigoTotp.ifBlank { null })
            app.filesDir.resolve("bio.dat").delete()
            banco.apagar()
            estado = EstadoBanco()
            app.travar()
            publicar {
                copy(
                    tela = "inicio",
                    itens = emptyList(),
                    identificador = "",
                    senha = "",
                    kit = "",
                    aviso = "Este aparelho saiu do cofre.",
                    biometria = false,
                )
            }
        }
    }

    fun travarAgora() {
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

    private fun linhas(sessao: SessaoCripto): List<LinhaItem> =
        estado.itens.filter { !it.meta.apagado }.map { item ->
            val conteudo = runCatching { conteudoDe(sessao.decifrarItem(item.blob).conteudo) }.getOrElse { ConteudoLogin(titulo = "Item ilegível") }
            LinhaItem(item.meta.itemId, conteudo.titulo.ifBlank { "Sem título" }, conteudo.usuario, conteudo.conflitoDe != null)
        }

    private fun gravar() {
        banco.gravar(estado)
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

