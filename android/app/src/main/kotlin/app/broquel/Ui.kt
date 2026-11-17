package app.broquel

import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
        Column(Modifier.fillMaxSize().padding(padding).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Broquel", style = MaterialTheme.typography.headlineMedium)
            if (ui.ocupado) CircularProgressIndicator()
            if (ui.erro.isNotBlank()) Text(ui.erro, color = Color(0xFFFFB4AB))
            if (ui.aviso.isNotBlank()) Text(ui.aviso)
            when (ui.tela) {
                "carregando" -> Text("Abrindo o cofre local…")
                "inicio" -> Inicio(ui, modelo)
                "criar" -> Criar(ui, modelo)
                "kit" -> Kit(ui, modelo)
                "desbloquear" -> Desbloquear(ui, modelo)
                "lista" -> Lista(ui, modelo)
                "editor" -> Editor(ui, modelo)
                "gerador" -> GeradorTela(ui, modelo)
                "ajustes" -> Ajustes(ui, modelo)
            }
        }
    }
}

@Composable
private fun Inicio(ui: Ui, modelo: Modelo) {
    Text("Crie um cofre neste aparelho ou traga um que já existe no servidor. A senha mestra não sai daqui.")
    Button(onClick = { modelo.ir("criar") }) { Text("Criar cofre") }
    OutlinedTextField(ui.url, modelo::definirUrl, label = { Text("Servidor") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(ui.identificadorRemoto, modelo::definirIdentificadorRemoto, label = { Text("Identificador do cofre") }, modifier = Modifier.fillMaxWidth())
    Button(onClick = modelo::trazerCofre, enabled = !ui.ocupado) { Text("Trazer do servidor") }
}

@Composable
private fun Criar(ui: Ui, modelo: Modelo) {
    OutlinedTextField(ui.senha, modelo::definirSenha, label = { Text("Senha mestra") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(ui.confirmacao, modelo::definirConfirmacao, label = { Text("Repita a senha") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
    Text("No mínimo 12 caracteres. A derivação usa Argon2id forte e pode levar alguns segundos.")
    Button(onClick = modelo::criar, enabled = !ui.ocupado) { Text("Criar") }
}

@Composable
private fun Kit(ui: Ui, modelo: Modelo) {
    Text("Anote este kit fora do aparelho. Ele abre o cofre se você esquecer a senha. Ele não será mostrado de novo.")
    Text(ui.kit)
    Text("Identificador, para o site: ${ui.identificador}")
    Button(onClick = { modelo.copiar(ui.identificador) }) { Text("Copiar identificador") }
    Button(onClick = { modelo.copiar(ui.kit) }) { Text("Copiar kit") }
    Button(onClick = modelo::kitGuardado) { Text("Já anotei") }
}

@Composable
private fun Desbloquear(ui: Ui, modelo: Modelo) {
    OutlinedTextField(ui.senha, modelo::definirSenha, label = { Text("Senha mestra") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
    Button(onClick = modelo::desbloquear, enabled = !ui.ocupado) { Text("Abrir") }
    if (ui.identificador.isNotBlank()) {
        Text("Identificador: ${ui.identificador}")
        TextButton(onClick = { modelo.copiar(ui.identificador) }) { Text("Copiar identificador") }
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
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = modelo::abrirGerador) { Text("Gerador") }
        TextButton(onClick = modelo::abrirAjustes) { Text("Ajustes") }
        TextButton(onClick = modelo::sincronizar) { Text("Sincronizar") }
        TextButton(onClick = modelo::travarAgora) { Text("Travar") }
    }
    Button(onClick = modelo::novoItem) { Text("Novo item") }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(ui.itens, key = { it.id.contentHashCode() }) { linha ->
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
    fun atualizar(novo: ConteudoLogin) = modelo.definirEditor(novo)
    OutlinedTextField(editor.titulo, { atualizar(editor.copy(titulo = it)) }, label = { Text("Título") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(editor.usuario, { atualizar(editor.copy(usuario = it)) }, label = { Text("Usuário") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(editor.senha, { atualizar(editor.copy(senha = it)) }, label = { Text("Senha") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(editor.url, { atualizar(editor.copy(url = it)) }, label = { Text("Site") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(editor.notas, { atualizar(editor.copy(notas = it)) }, label = { Text("Notas") }, modifier = Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = modelo::salvarEditor) { Text("Salvar") }
        if (ui.editandoId != null) {
            TextButton(onClick = { modelo.copiar(editor.senha) }) { Text("Copiar") }
            TextButton(onClick = modelo::apagarEditor) { Text("Apagar") }
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
        Text(ui.senhaGerada)
        Button(onClick = { modelo.copiar(ui.senhaGerada) }) { Text("Copiar") }
        Button(onClick = modelo::usarSenhaGerada) { Text("Usar num item") }
    }
    TextButton(onClick = { modelo.ir("lista") }) { Text("Voltar") }
}

@Composable
private fun Ajustes(ui: Ui, modelo: Modelo) {
    if (ui.identificador.isNotBlank()) {
        Text("Identificador: ${ui.identificador}")
        TextButton(onClick = { modelo.copiar(ui.identificador) }) { Text("Copiar identificador") }
    }
    OutlinedTextField(ui.url, modelo::definirUrl, label = { Text("Servidor") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(ui.pins, modelo::definirPins, label = { Text("Pins sha256/ do certificado, um por linha") }, modifier = Modifier.fillMaxWidth())
    Text("Bloqueio automático: ${ui.bloqueioSegundos}s")
    Slider(ui.bloqueioSegundos.toFloat(), { modelo.definirBloqueio(it.toInt()) }, valueRange = 15f..300f)
    OutlinedTextField(ui.codigoTotp, modelo::definirCodigo, label = { Text("Código TOTP, se o servidor pedir") }, modifier = Modifier.fillMaxWidth())
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
    TextButton(onClick = { modelo.ir("lista") }) { Text("Voltar") }
}

private fun autenticar(activity: FragmentActivity, cifra: Cipher, aoSucesso: (Cipher) -> Unit) {
    val prompt = BiometricPrompt(
        activity,
        ContextCompat.getMainExecutor(activity),
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                aoSucesso(result.cryptoObject?.cipher ?: cifra)
            }
        },
    )
    val info = BiometricPrompt.PromptInfo.Builder()
        .setTitle("Broquel")
        .setSubtitle("Confirme para proteger a chave do cofre")
        .setNegativeButtonText("Cancelar")
        .build()
    runCatching { prompt.authenticate(info, BiometricPrompt.CryptoObject(cifra)) }
        .onFailure { prompt.authenticate(info) }
}
