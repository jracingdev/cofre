package app.broquel

import androidx.activity.compose.BackHandler
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Pin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import javax.crypto.Cipher

private val Cores = darkColorScheme(
    primary = Color(0xFF3B82F6),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF1D4ED8),
    onPrimaryContainer = Color.White,
    secondaryContainer = Color(0xFF1E2A38),
    onSecondaryContainer = Color(0xFFDCE6F2),
    background = Color(0xFF071018),
    onBackground = Color(0xFFE6EDF5),
    surface = Color(0xFF071018),
    onSurface = Color(0xFFE6EDF5),
    surfaceVariant = Color(0xFF101820),
    onSurfaceVariant = Color(0xFF9FB0C3),
    surfaceContainer = Color(0xFF101820),
    surfaceContainerHigh = Color(0xFF15202B),
    outline = Color(0xFF3A4A5C),
    error = Color(0xFFFFB4AB),
    errorContainer = Color(0xFF5C1A16),
    onErrorContainer = Color(0xFFFFDAD6),
)

@Composable
fun Tema(conteudo: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Cores, content = conteudo)
}

/** Para onde o botão voltar leva em cada tela. */
private fun telaAnterior(tela: String): String? = when (tela) {
    "editor", "gerador", "ajustes" -> "lista"
    "sobre", "sair" -> "ajustes"
    "criar", "trazer" -> "inicio"
    else -> null
}

private fun tituloDa(ui: Ui): String = when (ui.tela) {
    "lista" -> ui.nomeCofre.ifBlank { if (ui.identificador.isNotBlank()) abreviarIdentificador(ui.identificador) else "Broquel" }
    "editor" -> "Item"
    "gerador" -> "Gerador de senhas"
    "ajustes" -> "Configurações"
    "sobre" -> "Sobre"
    "sair" -> "Sair deste aparelho"
    "criar" -> "Criar cofre"
    "trazer" -> "Já tenho um cofre"
    "kit" -> "Kit de recuperação"
    else -> ""
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun App(modelo: Modelo) {
    val ui by modelo.ui.collectAsState()
    val anterior = telaAnterior(ui.tela)
    BackHandler(enabled = anterior != null) { modelo.ir(anterior!!) }
    val titulo = tituloDa(ui)
    Scaffold(
        topBar = {
            if (titulo.isNotEmpty()) {
                TopAppBar(
                    title = { Text(titulo, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    navigationIcon = {
                        if (anterior != null) {
                            IconButton(onClick = { modelo.ir(anterior) }) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                            }
                        }
                    },
                    actions = {
                        if (ui.tela == "lista") {
                            IconButton(onClick = modelo::sincronizar, enabled = !ui.ocupado) {
                                Icon(Icons.Filled.Sync, contentDescription = "Sincronizar")
                            }
                            IconButton(onClick = modelo::abrirGerador) {
                                Icon(Icons.Filled.AutoAwesome, contentDescription = "Gerador de senhas")
                            }
                            IconButton(onClick = modelo::abrirAjustes) {
                                Icon(Icons.Filled.Settings, contentDescription = "Configurações")
                            }
                            IconButton(onClick = modelo::travarAgora) {
                                Icon(Icons.Filled.Lock, contentDescription = "Travar")
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                )
            }
        },
        floatingActionButton = {
            if (ui.tela == "lista") {
                ExtendedFloatingActionButton(
                    onClick = modelo::novoItem,
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text("Novo item") },
                )
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (ui.ocupado) LinearProgressIndicator(Modifier.fillMaxWidth())
            Mensagens(ui, modelo)
            when (ui.tela) {
                "lista" -> Lista(ui, modelo)
                else -> Rolavel {
                    when (ui.tela) {
                        "carregando" -> Centro {
                            Logo(140.dp)
                            Text("Abrindo o cofre local…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        "inicio" -> Inicio(ui, modelo)
                        "criar" -> Criar(ui, modelo)
                        "trazer" -> Trazer(ui, modelo)
                        "kit" -> Kit(ui, modelo)
                        "desbloquear" -> Desbloquear(ui, modelo)
                        "editor" -> Editor(ui, modelo)
                        "gerador" -> GeradorTela(ui, modelo)
                        "ajustes" -> Ajustes(ui, modelo)
                        "sair" -> Saida(ui, modelo)
                        "sobre" -> Sobre(ui)
                    }
                }
            }
        }
    }
}

@Composable
private fun Rolavel(conteudo: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        content = conteudo,
    )
}

@Composable
private fun Centro(conteudo: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
        content = conteudo,
    )
}

@Composable
private fun Mensagens(ui: Ui, modelo: Modelo) {
    if (ui.erro.isNotBlank()) {
        Faixa(ui.erro, MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer) { modelo.limparMensagens() }
    } else if (ui.aviso.isNotBlank()) {
        Faixa(ui.aviso, MaterialTheme.colorScheme.secondaryContainer, MaterialTheme.colorScheme.onSecondaryContainer) { modelo.limparMensagens() }
    }
}

@Composable
private fun Faixa(texto: String, fundo: Color, cor: Color, aoFechar: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = fundo, contentColor = cor),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(Modifier.padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(texto, Modifier.weight(1f).padding(vertical = 8.dp), style = MaterialTheme.typography.bodyMedium)
            TextButton(onClick = aoFechar) { Text("OK", color = cor) }
        }
    }
}

@Composable
private fun Secao(titulo: String, conteudo: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            titulo.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(start = 4.dp),
        )
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(vertical = 4.dp), content = conteudo)
        }
    }
}

@Composable
private fun Linha(
    titulo: String,
    detalhe: String? = null,
    icone: ImageVector? = null,
    aoTocar: (() -> Unit)? = null,
    fim: (@Composable () -> Unit)? = null,
) {
    ListItem(
        headlineContent = { Text(titulo) },
        supportingContent = detalhe?.let { { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
        leadingContent = icone?.let { { Icon(it, contentDescription = null) } },
        trailingContent = fim,
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = if (aoTocar != null) Modifier.clickable(onClick = aoTocar) else Modifier,
    )
}

@Composable
private fun Dentro(conteudo: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = conteudo)
}

@Composable
private fun CampoSenha(valor: String, aoMudar: (String) -> Unit, rotulo: String, modifier: Modifier = Modifier) {
    var visivel by rememberSaveable { mutableStateOf(false) }
    OutlinedTextField(
        valor,
        aoMudar,
        label = { Text(rotulo) },
        singleLine = true,
        visualTransformation = if (visivel) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false),
        trailingIcon = {
            IconButton(onClick = { visivel = !visivel }) {
                Icon(
                    if (visivel) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = if (visivel) "Esconder" else "Mostrar",
                )
            }
        },
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun Campo(valor: String, aoMudar: (String) -> Unit, rotulo: String, linhaUnica: Boolean = true, teclado: KeyboardType = KeyboardType.Text) {
    OutlinedTextField(
        valor,
        aoMudar,
        label = { Text(rotulo) },
        singleLine = linhaUnica,
        minLines = if (linhaUnica) 1 else 3,
        keyboardOptions = KeyboardOptions(keyboardType = teclado),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun BotaoCheio(texto: String, aoTocar: () -> Unit, habilitado: Boolean = true, icone: ImageVector? = null) {
    Button(onClick = aoTocar, enabled = habilitado, modifier = Modifier.fillMaxWidth().height(52.dp)) {
        if (icone != null) {
            Icon(icone, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.size(8.dp))
        }
        Text(texto)
    }
}

@Composable
private fun BotaoContorno(texto: String, aoTocar: () -> Unit, habilitado: Boolean = true, icone: ImageVector? = null) {
    OutlinedButton(onClick = aoTocar, enabled = habilitado, modifier = Modifier.fillMaxWidth().height(52.dp)) {
        if (icone != null) {
            Icon(icone, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.size(8.dp))
        }
        Text(texto)
    }
}

@Composable
private fun Explicacao(texto: String) {
    Text(texto, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun Cabecalho(subtitulo: String) {
    Centro {
        Spacer(Modifier.height(12.dp))
        Logo(120.dp)
        Text("Broquel", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
        Text(subtitulo, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
    }
}

@Composable
private fun Inicio(ui: Ui, modelo: Modelo) {
    Cabecalho("Seu cofre de senhas. A senha mestra não sai deste aparelho.")
    BotaoCheio("Criar cofre novo", { modelo.ir("criar") }, icone = Icons.Filled.Add)
    BotaoContorno("Já tenho um cofre", { modelo.ir("trazer") }, icone = Icons.Filled.Sync)
    if (ui.identificador.isNotBlank()) {
        TextButton(onClick = { modelo.ir("desbloquear") }, modifier = Modifier.fillMaxWidth()) { Text("Voltar ao cofre deste aparelho") }
    }
}

@Composable
private fun Trazer(ui: Ui, modelo: Modelo) {
    Explicacao(
        "Use o identificador de 32 caracteres do cofre. Ele aparece em Configurações no outro celular, " +
            "ou no site, depois de abrir o cofre. Depois você abre com a mesma senha mestra.",
    )
    Campo(ui.identificadorRemoto, modelo::definirIdentificadorRemoto, "Identificador do cofre")
    Text(
        "${ui.identificadorRemoto.length} de 32 caracteres",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Campo(ui.url, modelo::definirUrl, "Servidor (https)", teclado = KeyboardType.Uri)
    BotaoCheio(
        "Trazer do servidor",
        modelo::trazerCofre,
        habilitado = !ui.ocupado && ui.identificadorRemoto.length == 32,
        icone = Icons.Filled.Sync,
    )
}

@Composable
private fun Criar(ui: Ui, modelo: Modelo) {
    Explicacao("Escolha uma senha mestra longa, que só você saiba. Ela não pode ser recuperada pelo servidor.")
    CampoSenha(ui.senha, modelo::definirSenha, "Senha mestra")
    CampoSenha(ui.confirmacao, modelo::definirConfirmacao, "Repita a senha")
    Explicacao("No mínimo 12 caracteres. A derivação usa Argon2id forte e pode levar alguns segundos.")
    BotaoCheio("Criar", modelo::criar, habilitado = !ui.ocupado)
}

@Composable
private fun Kit(ui: Ui, modelo: Modelo) {
    Explicacao("Anote este kit fora do aparelho. Ele abre o cofre se você esquecer a senha e não será mostrado de novo.")
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh), modifier = Modifier.fillMaxWidth()) {
        Text(ui.kit, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(16.dp))
    }
    BotaoContorno("Copiar kit", { modelo.copiar(ui.kit) }, icone = Icons.Filled.ContentCopy)
    Secao("Identificador, para o site") {
        Linha(ui.identificador, icone = Icons.Filled.Info, fim = {
            IconButton(onClick = { modelo.copiar(ui.identificador, sensivel = false) }) { Icon(Icons.Filled.ContentCopy, contentDescription = "Copiar identificador") }
        })
    }
    BotaoCheio("Já anotei", modelo::kitGuardado)
}

@Composable
private fun Desbloquear(ui: Ui, modelo: Modelo) {
    Cabecalho(ui.apelido.ifBlank { "Cofre travado" })
    CampoSenha(ui.senha, modelo::definirSenha, "Senha mestra")
    BotaoCheio("Abrir", modelo::desbloquear, habilitado = !ui.ocupado && ui.senha.isNotEmpty(), icone = Icons.Filled.Lock)
    if (ui.podeBiometria) {
        val activity = LocalContext.current as FragmentActivity
        BotaoContorno("Abrir com biometria", {
            val cifra = modelo.cifraParaAbrirBio() ?: return@BotaoContorno
            autenticar(activity, cifra, pin = false, modelo = modelo, aoSucesso = modelo::abrirBio)
        }, icone = Icons.Filled.Fingerprint)
        if (ui.podePin) {
            TextButton(onClick = {
                val cifra = modelo.cifraParaAbrirBio() ?: return@TextButton
                autenticar(activity, cifra, pin = true, modelo = modelo, aoSucesso = modelo::abrirBio)
            }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Pin, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text("Usar o PIN do celular")
            }
        }
    } else if (ui.motivoSenha.isNotBlank()) {
        Explicacao(ui.motivoSenha)
    }
    Spacer(Modifier.height(8.dp))
    if (ui.identificador.isNotBlank()) {
        Secao("Este cofre") {
            Linha("Identificador", ui.identificador, fim = {
                IconButton(onClick = { modelo.copiar(ui.identificador, sensivel = false) }) { Icon(Icons.Filled.ContentCopy, contentDescription = "Copiar identificador") }
            })
        }
    }
    TextButton(onClick = { modelo.ir("inicio") }, modifier = Modifier.fillMaxWidth()) { Text("Usar outro cofre") }
}

@Composable
private fun Lista(ui: Ui, modelo: Modelo) {
    if (ui.itens.isEmpty()) {
        Rolavel {
            Centro {
                Spacer(Modifier.height(48.dp))
                Logo(96.dp)
                Text("Nenhum item ainda", style = MaterialTheme.typography.titleMedium)
                Explicacao("Toque em Novo item para guardar a primeira senha.")
            }
        }
        return
    }
    var busca by rememberSaveable { mutableStateOf("") }
    val termo = busca.trim()
    val visiveis = if (termo.isEmpty()) ui.itens else ui.itens.filter {
        it.titulo.contains(termo, ignoreCase = true) || it.usuario.contains(termo, ignoreCase = true)
    }
    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        if (ui.itens.size > 5) {
            item {
                OutlinedTextField(
                    busca,
                    { busca = it },
                    label = { Text("Buscar") },
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (visiveis.isEmpty()) {
            item { Explicacao("Nada encontrado para \"$termo\".") }
        }
        items(visiveis.sortedBy { it.titulo.lowercase() }, key = { it.id.contentHashCode() }) { linha ->
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
                modifier = Modifier.fillMaxWidth().clickable { modelo.editar(linha) },
            ) {
                ListItem(
                    headlineContent = { Text(linha.titulo, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    supportingContent = {
                        val detalhe = if (linha.conflito) "Conflito para revisar" else linha.usuario
                        if (detalhe.isNotBlank()) {
                            Text(
                                detalhe,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = if (linha.conflito) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                    leadingContent = { Inicial(linha.titulo) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                )
            }
        }
    }
}

@Composable
private fun Inicial(titulo: String) {
    Box(
        Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Text(titulo.trim().take(1).uppercase().ifEmpty { "?" }, color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun Editor(ui: Ui, modelo: Modelo) {
    val editor = ui.editor
    fun atualizar(novo: ConteudoLogin) = modelo.definirEditor(novo)
    Campo(editor.titulo, { atualizar(editor.copy(titulo = it)) }, "Título")
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) { Campo(editor.usuario, { atualizar(editor.copy(usuario = it)) }, "Usuário ou e-mail", teclado = KeyboardType.Email) }
        IconButton(onClick = { modelo.copiar(editor.usuario, sensivel = false) }, enabled = editor.usuario.isNotEmpty()) {
            Icon(Icons.Filled.ContentCopy, contentDescription = "Copiar usuário")
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        CampoSenha(editor.senha, { atualizar(editor.copy(senha = it)) }, "Senha", Modifier.weight(1f))
        IconButton(onClick = { modelo.copiar(editor.senha) }, enabled = editor.senha.isNotEmpty()) {
            Icon(Icons.Filled.ContentCopy, contentDescription = "Copiar senha")
        }
    }
    TextButton(onClick = modelo::gerarParaEditor) {
        Icon(Icons.Filled.AutoAwesome, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(8.dp))
        Text("Gerar senha forte")
    }
    Campo(editor.url, { atualizar(editor.copy(url = it)) }, "Site", teclado = KeyboardType.Uri)
    Campo(editor.notas, { atualizar(editor.copy(notas = it)) }, "Notas", linhaUnica = false)
    BotaoCheio("Salvar", modelo::salvarEditor)
    if (ui.editandoId != null) {
        var confirmar by remember { mutableStateOf(false) }
        if (!confirmar) {
            TextButton(onClick = { confirmar = true }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                Spacer(Modifier.size(8.dp))
                Text("Apagar item", color = MaterialTheme.colorScheme.error)
            }
        } else {
            Explicacao("Apagar este item? No servidor fica só a marca de exclusão, sem o conteúdo.")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { confirmar = false }, modifier = Modifier.weight(1f)) { Text("Cancelar") }
                Button(onClick = modelo::apagarEditor, modifier = Modifier.weight(1f)) { Text("Apagar") }
            }
        }
    }
}

@Composable
private fun GeradorTela(ui: Ui, modelo: Modelo) {
    val rotulos = listOf("Básico", "Forte", "Alto", "Militar")
    Secao("Força") {
        Dentro {
            Text("Nível: ${rotulos[ui.nivel - 1]}")
            Slider(ui.nivel.toFloat(), modelo::deslizarNivel, valueRange = 1f..4f, steps = 2)
            Text("Comprimento: ${ui.comprimento} caracteres")
            val minimo = listOf(12, 16, 24, 32)[ui.nivel - 1]
            Slider(ui.comprimento.toFloat(), modelo::deslizarComprimento, valueRange = minimo.toFloat()..128f)
            Explicacao("Cerca de ${ui.bits} bits de entropia.")
        }
    }
    BotaoCheio("Gerar", modelo::gerar, icone = Icons.Filled.AutoAwesome)
    if (ui.senhaGerada.isNotBlank()) {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh), modifier = Modifier.fillMaxWidth()) {
            Text(ui.senhaGerada, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(16.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { modelo.copiar(ui.senhaGerada) }, modifier = Modifier.weight(1f)) { Text("Copiar") }
            Button(onClick = modelo::usarSenhaGerada, modifier = Modifier.weight(1f)) { Text("Usar num item") }
        }
    }
}

@Composable
private fun Ajustes(ui: Ui, modelo: Modelo) {
    val activity = LocalContext.current as FragmentActivity
    Secao("Segurança") {
        val detalhe = when {
            ui.biometria && guardaAceitaPin() -> "Biometria forte, com o PIN do celular de reserva."
            ui.biometria -> "Biometria forte."
            ui.abertoComSenha -> "Desligada. Só a senha mestra abre o cofre."
            else -> "Para ligar, trave e abra o cofre com a senha mestra."
        }
        Linha(
            "Desbloqueio por biometria",
            detalhe,
            Icons.Filled.Fingerprint,
            fim = {
                Switch(
                    checked = ui.biometria,
                    enabled = ui.biometria || ui.abertoComSenha,
                    onCheckedChange = { ligar ->
                        if (!ligar) {
                            modelo.desligarBiometria()
                        } else {
                            modelo.ligarBiometria { cifra ->
                                autenticar(activity, cifra, pin = false, modelo = null) { pronta ->
                                    val segredo = modelo.segredoParaBio() ?: return@autenticar
                                    val cifrado = pronta.iv + pronta.doFinal(segredo)
                                    segredo.fill(0)
                                    modelo.guardarBio(cifrado)
                                }
                            }
                        }
                    },
                )
            },
        )
        if (ui.biometria) {
            Dentro {
                Explicacao(
                    "A senha mestra é pedida a cada ${Desbloqueio.PRAZO_DIAS} dias, depois de reiniciar o celular " +
                        "e depois de ${Desbloqueio.LIMITE_FALHAS} falhas seguidas.",
                )
            }
        }
        HorizontalDivider(Modifier.padding(horizontal = 16.dp))
        Dentro {
            Text("Travar após ${rotuloTempo(ui.bloqueioSegundos)} sem uso")
            Slider(ui.bloqueioSegundos.toFloat(), { modelo.definirBloqueio(it.toInt()) }, valueRange = 15f..300f)
            Explicacao("Vale com o app aberto sem toque e em segundo plano.")
        }
    }
    Secao("Sincronização") {
        Dentro {
            Campo(ui.url, modelo::definirUrl, "Servidor (https)", teclado = KeyboardType.Uri)
            Campo(ui.pins, modelo::definirPins, "Pins sha256/ do certificado, um por linha", linhaUnica = false)
            Campo(ui.codigoTotp, modelo::definirCodigo, "Código TOTP, se o servidor pedir", teclado = KeyboardType.NumberPassword)
            BotaoContorno("Sincronizar agora", modelo::sincronizar, habilitado = !ui.ocupado, icone = Icons.Filled.Sync)
        }
    }
    Secao("Nome") {
        Dentro {
            Campo(ui.nomeDigitado, modelo::definirNomeDigitado, "Nome do cofre")
            Explicacao("O nome é cifrado; o servidor não o vê. Sincronize para o site mostrar o mesmo.")
            BotaoContorno("Guardar nome", modelo::salvarNome, habilitado = !ui.ocupado)
        }
        HorizontalDivider(Modifier.padding(horizontal = 16.dp))
        Dentro {
            Campo(ui.apelidoDigitado, modelo::definirApelidoDigitado, "Apelido neste celular")
            Explicacao("Aparece na tela de desbloqueio, só neste celular. Não vai para o servidor.")
            BotaoContorno("Guardar apelido", modelo::salvarApelido)
        }
    }
    Secao("Cofre") {
        if (ui.identificador.isNotBlank()) {
            Linha("Identificador", ui.identificador, fim = {
                IconButton(onClick = { modelo.copiar(ui.identificador, sensivel = false) }) { Icon(Icons.Filled.ContentCopy, contentDescription = "Copiar identificador") }
            })
            HorizontalDivider(Modifier.padding(horizontal = 16.dp))
        }
        Linha(
            "Preenchimento automático",
            "Ative em Ajustes do Android, Senhas e preenchimento automático, Broquel. No Chrome, ligue também \"Preenchimento automático usando outro serviço\" nas configurações dele. O Broquel só oferece a senha do mesmo site ou app e pergunta se quer guardar as novas.",
        )
    }
    Secao("Aplicativo") {
        Linha("Sobre", "Versão ${ui.versao}", Icons.Filled.Info, aoTocar = { modelo.ir("sobre") })
        HorizontalDivider(Modifier.padding(horizontal = 16.dp))
        Linha("Sair deste aparelho", "Apaga o cofre e a biometria deste celular.", Icons.AutoMirrored.Filled.Logout, aoTocar = modelo::pedirSaida)
    }
}

private fun rotuloTempo(segundos: Int): String =
    if (segundos < 60) "$segundos s" else if (segundos % 60 == 0) "${segundos / 60} min" else "${segundos / 60} min ${segundos % 60} s"

private fun guardaAceitaPin(): Boolean = android.os.Build.VERSION.SDK_INT >= 30

@Composable
private fun Saida(ui: Ui, modelo: Modelo) {
    Explicacao("Sair apaga o cofre, a biometria e a sessão deste celular. O cofre no servidor continua.")
    Explicacao("O que ainda não foi sincronizado será perdido.")
    BotaoCheio("Sincronizar e sair", { modelo.sairDoAparelho(true) }, habilitado = !ui.ocupado, icone = Icons.Filled.Sync)
    BotaoContorno("Sair sem sincronizar", { modelo.sairDoAparelho(false) }, habilitado = !ui.ocupado)
    if (ui.saidaSemServidor) {
        TextButton(onClick = modelo::sairSoDaqui, enabled = !ui.ocupado, modifier = Modifier.fillMaxWidth()) {
            Text("Apagar só deste celular", color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun Sobre(ui: Ui) {
    val links = LocalUriHandler.current
    Cabecalho("Gerenciador de senhas pessoal")
    Secao("Aplicativo") {
        Linha("Versão", ui.versao)
        HorizontalDivider(Modifier.padding(horizontal = 16.dp))
        Linha("Segurança", "As senhas são cifradas neste aparelho antes de sair dele. O servidor guarda só dados que não consegue abrir.")
    }
    Secao("Desenvolvedor") {
        Linha("Desenvolvido por jracing.dev.br", "https://jracing.dev.br", Icons.Filled.Info, aoTocar = { links.openUri("https://jracing.dev.br") })
    }
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

/**
 * Dia a dia: só biometria forte (classe 3). Com [pin], só o PIN/padrão do celular (Android 11+).
 * Com [modelo], as falhas contam para o limite que obriga a senha mestra.
 */
private fun autenticar(activity: FragmentActivity, cifra: Cipher, pin: Boolean, modelo: Modelo?, aoSucesso: (Cipher) -> Unit) {
    val prompt = BiometricPrompt(
        activity,
        ContextCompat.getMainExecutor(activity),
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                val pronta = result.cryptoObject?.cipher ?: return
                aoSucesso(pronta)
            }

            override fun onAuthenticationFailed() {
                modelo?.falhaBio()
            }

            override fun onAuthenticationError(codigo: Int, mensagem: CharSequence) {
                if (codigo == BiometricPrompt.ERROR_LOCKOUT || codigo == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) {
                    modelo?.bloqueioDoSistema()
                }
            }
        },
    )
    val construtor = BiometricPrompt.PromptInfo.Builder()
        .setTitle("Broquel")
        .setSubtitle(if (pin) "Digite o PIN ou padrão do celular" else "Confirme para abrir a chave do cofre")
    if (pin) {
        construtor.setAllowedAuthenticators(BiometricManager.Authenticators.DEVICE_CREDENTIAL)
    } else {
        construtor
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText("Cancelar")
    }
    prompt.authenticate(construtor.build(), BiometricPrompt.CryptoObject(cifra))
}
