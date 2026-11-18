package app.broquel

import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import javax.crypto.Cipher

private val Cores = darkColorScheme(
    primary = Color(0xFF1D4ED8),
    background = Color(0xFF071018),
    surface = Color(0xFF101820),
)

@Composable
fun Tema(conteudo: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Cores, content = conteudo)
}

@Composable
fun App(modelo: Modelo) {
    val ui by modelo.ui.collectAsState()
    Scaffold { padding ->
        // A lista usa LazyColumn, que não pode ficar dentro de outra rolagem. As outras telas rolam,
        // senão Ajustes e o teclado escondem os botões de baixo em celular pequeno.
        val rolagem = if (ui.tela == "lista") Modifier else Modifier.verticalScroll(rememberScrollState())
        Column(Modifier.fillMaxSize().padding(padding).then(rolagem).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(tituloDaTela(ui), style = MaterialTheme.typography.headlineMedium)
            if (ui.ocupado) CircularProgressIndicator()
            if (ui.erro.isNotBlank()) Text(ui.erro, color = Color(0xFFFFB4AB))
            if (ui.aviso.isNotBlank()) Text(ui.aviso)
            when (ui.tela) {
                "carregando" -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Logo(160.dp)
                    Text("Abrindo o cofre local…")
                }
                "inicio" -> Inicio(ui, modelo)
                "criar" -> Criar(ui, modelo)
                "kit" -> Kit(ui, modelo)
                "desbloquear" -> Desbloquear(ui, modelo)
                "lista" -> Lista(ui, modelo)
                "editor" -> Editor(ui, modelo)
                "gerador" -> GeradorTela(ui, modelo)
                "ajustes" -> Ajustes(ui, modelo)
                "sair" -> Saida(ui, modelo)
            }
        }
    }
}

@Composable
private fun Inicio(ui: Ui, modelo: Modelo) {
    Text("Crie um cofre neste aparelho ou traga um que já existe no servidor. A senha mestra não sai daqui.")
    Button(onClick = { modelo.ir("criar") }) { Text("Criar cofre") }
    OutlinedTextField(ui.url, modelo::definirUrl, label = { Text("Servidor") }, placeholder = { Text("https://cofre.seudominio") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(ui.identificadorRemoto, modelo::definirIdentificadorRemoto, label = { Text("Identificador do cofre") }, modifier = Modifier.fillMaxWidth())
    Button(onClick = modelo::trazerCofre, enabled = !ui.ocupado) { Text("Trazer do servidor") }
}

@Composable
private fun Criar(ui: Ui, modelo: Modelo) {
    OutlinedTextField(ui.senha, modelo::definirSenha, label = { Text("Senha mestra") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(ui.confirmacao, modelo::definirConfirmacao, label = { Text("Repita a senha") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
    Text("No mínimo 12 caracteres. A derivação usa Argon2id forte e pode levar alguns segundos.")
    Button(onClick = modelo::criar, enabled = !ui.ocupado) { Text("Criar") }
}

@Composable
private fun Kit(ui: Ui, modelo: Modelo) {
    Text("Anote este kit fora do aparelho. Ele abre o cofre se você esquecer a senha. Ele não será mostrado de novo.")
    Text(ui.kit, fontFamily = FontFamily.Monospace)
    Text("Identificador, para o site: ${ui.identificador}")
    Button(onClick = { modelo.copiar(ui.identificador, sensivel = false) }) { Text("Copiar identificador") }
    Button(onClick = { modelo.copiar(ui.kit) }) { Text("Copiar kit") }
    Button(onClick = modelo::kitGuardado) { Text("Já anotei") }
}

@Composable
private fun Desbloquear(ui: Ui, modelo: Modelo) {
    Logo(160.dp)
    OutlinedTextField(ui.senha, modelo::definirSenha, label = { Text("Senha mestra") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
    Button(onClick = modelo::desbloquear, enabled = !ui.ocupado) { Text("Abrir") }
    if (ui.identificador.isNotBlank()) {
        Text("Identificador: ${ui.identificador}")
        TextButton(onClick = { modelo.copiar(ui.identificador, sensivel = false) }) { Text("Copiar identificador") }
    }
    TextButton(onClick = { modelo.ir("inicio") }) { Text("Outro cofre") }
    if (modelo.pedirBiometria()) {
        val activity = LocalContext.current as FragmentActivity
        Button(onClick = {
            val arquivo = activity.filesDir.resolve("bio.dat")
            if (!arquivo.exists()) return@Button
            val bytes = arquivo.readBytes()
            val cifra = modelo.let { GuardaChaves(activity).cifraParaAbrirBio(bytes.copyOfRange(0, 12)) }
            autenticar(activity, cifra) { pronta ->
                modelo.abrirBio(pronta.doFinal(bytes.copyOfRange(12, bytes.size)))
            }
        }) { Text("Biometria") }
    }
}

@Composable
private fun Lista(ui: Ui, modelo: Modelo) {
    var busca by remember { mutableStateOf("") }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = modelo::abrirGerador) { Text("Gerador") }
        TextButton(onClick = modelo::abrirAjustes) { Text("Ajustes") }
        TextButton(onClick = modelo::sincronizar, enabled = !ui.ocupado) { Text("Sincronizar") }
        TextButton(onClick = modelo::travarAgora) { Text("Travar") }
    }
    Button(onClick = modelo::novoItem) { Text("Novo item") }
    if (ui.itens.size > 5) {
        OutlinedTextField(busca, { busca = it }, label = { Text("Buscar") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    }
    val termo = busca.trim()
    val visiveis = if (termo.isEmpty()) ui.itens else ui.itens.filter {
        it.titulo.contains(termo, ignoreCase = true) || it.usuario.contains(termo, ignoreCase = true)
    }
    if (ui.itens.isEmpty()) Text("Nenhum item ainda. Toque em Novo item para guardar a primeira senha.")
    else if (visiveis.isEmpty()) Text("Nada encontrado para \"$termo\".")
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(visiveis.sortedBy { it.titulo.lowercase() }, key = { it.id.contentHashCode() }) { linha ->
            TextButton(onClick = { modelo.editar(linha) }, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth()) {
                    Text(linha.titulo + if (linha.conflito) " (conflito)" else "")
                    Text(linha.usuario, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun Editor(ui: Ui, modelo: Modelo) {
    val editor = ui.editor
    var mostrarSenha by remember(ui.editandoId) { mutableStateOf(false) }
    var confirmarApagar by remember(ui.editandoId) { mutableStateOf(false) }
    fun atualizar(novo: ConteudoLogin) = modelo.definirEditor(novo)
    OutlinedTextField(editor.titulo, { atualizar(editor.copy(titulo = it)) }, label = { Text("Título") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(editor.usuario, { atualizar(editor.copy(usuario = it)) }, label = { Text("Usuário") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(
        editor.senha,
        { atualizar(editor.copy(senha = it)) },
        label = { Text("Senha") },
        singleLine = true,
        // Senha escondida por padrão: quem olha a tela não lê sem um toque a mais.
        visualTransformation = if (mostrarSenha) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = { TextButton(onClick = { mostrarSenha = !mostrarSenha }) { Text(if (mostrarSenha) "Ocultar" else "Mostrar") } },
        modifier = Modifier.fillMaxWidth(),
    )
    TextButton(onClick = modelo::gerarParaEditor) { Text("Gerar senha forte") }
    OutlinedTextField(editor.url, { atualizar(editor.copy(url = it)) }, label = { Text("Site") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(editor.notas, { atualizar(editor.copy(notas = it)) }, label = { Text("Notas") }, modifier = Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = modelo::salvarEditor) { Text("Salvar") }
        if (ui.editandoId != null) {
            TextButton(onClick = { modelo.copiar(editor.usuario, sensivel = false) }) { Text("Copiar usuário") }
            TextButton(onClick = { modelo.copiar(editor.senha) }) { Text("Copiar senha") }
        }
    }
    if (ui.editandoId != null) {
        if (confirmarApagar) {
            Text("Apagar este item? No servidor fica só a marca de exclusão, sem o conteúdo.")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = modelo::apagarEditor) { Text("Apagar de vez") }
                TextButton(onClick = { confirmarApagar = false }) { Text("Manter") }
            }
        } else {
            TextButton(onClick = { confirmarApagar = true }) { Text("Apagar") }
        }
    }
    TextButton(onClick = { modelo.ir("lista") }) { Text("Voltar") }
}

@Composable
private fun GeradorTela(ui: Ui, modelo: Modelo) {
    val rotulos = listOf("Básico", "Forte", "Alto", "Militar")
    Text("Nível: ${rotulos[ui.nivel - 1]}")
    Slider(ui.nivel.toFloat(), modelo::deslizarNivel, valueRange = 1f..4f, steps = 2)
    Text("Comprimento: ${ui.comprimento} · cerca de ${ui.bits} bits")
    val minimo = listOf(12, 16, 24, 32)[ui.nivel - 1]
    Slider(ui.comprimento.toFloat(), modelo::deslizarComprimento, valueRange = minimo.toFloat()..128f)
    Button(onClick = modelo::gerar) { Text("Gerar") }
    if (ui.senhaGerada.isNotBlank()) {
        Text(ui.senhaGerada, fontFamily = FontFamily.Monospace)
        Button(onClick = { modelo.copiar(ui.senhaGerada) }) { Text("Copiar") }
        Button(onClick = modelo::usarSenhaGerada) { Text("Usar num item") }
    }
    TextButton(onClick = { modelo.ir("lista") }) { Text("Voltar") }
}

@Composable
private fun Ajustes(ui: Ui, modelo: Modelo) {
    if (ui.identificador.isNotBlank()) {
        Text("Identificador: ${ui.identificador}")
        TextButton(onClick = { modelo.copiar(ui.identificador, sensivel = false) }) { Text("Copiar identificador") }
    }
    OutlinedTextField(ui.nomeDigitado, modelo::definirNomeDigitado, label = { Text("Nome do cofre") }, modifier = Modifier.fillMaxWidth())
    Text("Esse nome é cifrado. O servidor não o vê. Sincronize para o site mostrar o mesmo.")
    Button(onClick = modelo::salvarNome, enabled = !ui.ocupado) { Text("Guardar nome") }
    OutlinedTextField(ui.apelidoDigitado, modelo::definirApelidoDigitado, label = { Text("Apelido neste celular") }, modifier = Modifier.fillMaxWidth())
    Text("O apelido aparece antes da senha, só neste celular. Não vai para o servidor. Quem usar o aparelho desbloqueado pode vê-lo no arquivo local cifrado pelo sistema.")
    Button(onClick = modelo::salvarApelido) { Text("Guardar apelido") }
    OutlinedTextField(ui.url, modelo::definirUrl, label = { Text("Servidor") }, placeholder = { Text("https://cofre.seudominio") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(ui.pins, modelo::definirPins, label = { Text("Pins sha256/ do certificado, um por linha") }, modifier = Modifier.fillMaxWidth())
    Text("Bloqueio automático: ${ui.bloqueioSegundos}s")
    Slider(ui.bloqueioSegundos.toFloat(), { modelo.definirBloqueio(it.toInt()) }, valueRange = 15f..300f)
    OutlinedTextField(ui.codigoTotp, modelo::definirCodigo, label = { Text("Código TOTP, se o servidor pedir") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth())
    Button(onClick = modelo::sincronizar, enabled = !ui.ocupado) { Text("Sincronizar agora") }
    val activity = LocalContext.current as FragmentActivity
    if (!ui.biometria) {
        Button(onClick = {
            modelo.ligarBiometria { cifra ->
                autenticar(activity, cifra) { pronta ->
                    val segredo = modelo.segredoParaBio() ?: return@autenticar
                    val cifrado = pronta.iv + pronta.doFinal(segredo)
                    modelo.guardarBio(cifrado)
                }
            }
        }) { Text("Ligar biometria") }
    }
    Text("O preenchimento automático fica em Ajustes do Android, senhas e preenchimento automático, Broquel.")
    Button(onClick = modelo::pedirSaida) { Text("Sair deste aparelho") }
    TextButton(onClick = { modelo.ir("lista") }) { Text("Voltar") }
}

@Composable
private fun Saida(ui: Ui, modelo: Modelo) {
    Text("Sair apaga o cofre neste celular e encerra a sessão deste aparelho. O cofre no servidor continua.")
    Text("O que ainda não foi sincronizado será perdido.")
    Button(onClick = { modelo.sairDoAparelho(true) }, enabled = !ui.ocupado) { Text("Sincronizar e sair") }
    TextButton(onClick = { modelo.sairDoAparelho(false) }, enabled = !ui.ocupado) { Text("Sair sem sincronizar") }
    if (ui.saidaSemServidor) {
        TextButton(onClick = modelo::sairSoDaqui, enabled = !ui.ocupado) { Text("Apagar só deste celular") }
    }
    TextButton(onClick = { modelo.ir("ajustes") }) { Text("Cancelar") }
}

private fun tituloDaTela(ui: Ui): String {
    val aberto = ui.tela == "lista" || ui.tela == "editor" || ui.tela == "gerador" || ui.tela == "ajustes" || ui.tela == "sair" || ui.tela == "kit"
    if (aberto && ui.nomeCofre.isNotBlank()) return ui.nomeCofre
    if (aberto && ui.identificador.isNotBlank()) return abreviarIdentificador(ui.identificador)
    if (ui.tela == "desbloquear" && ui.apelido.isNotBlank()) return ui.apelido
    if (ui.tela == "desbloquear" && ui.identificador.isNotBlank()) return abreviarIdentificador(ui.identificador)
    return "Broquel"
}

@Composable
private fun Logo(tamanho: Dp) {
    Image(
        painter = painterResource(R.drawable.logo_broquel),
        contentDescription = "Broquel",
        modifier = Modifier.size(tamanho),
        contentScale = ContentScale.Fit,
    )
}

private fun autenticar(activity: FragmentActivity, cifra: Cipher, aoSucesso: (Cipher) -> Unit) {
    val prompt = BiometricPrompt(
        activity,
        ContextCompat.getMainExecutor(activity),
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                val pronta = result.cryptoObject?.cipher ?: return
                aoSucesso(pronta)
            }
        },
    )
    val info = BiometricPrompt.PromptInfo.Builder()
        .setTitle("Broquel")
        .setSubtitle("Confirme para proteger a chave do cofre")
        .setNegativeButtonText("Cancelar")
        .build()
    prompt.authenticate(info, BiometricPrompt.CryptoObject(cifra))
}
