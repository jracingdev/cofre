package app.broquel

/** Por que só a senha mestra pode abrir o cofre agora. */
enum class MotivoSenha(val texto: String) {
    NENHUM(""),
    SEM_BIOMETRIA(""),
    NUNCA_ABRIU("Abra com a senha mestra para liberar a biometria."),
    PRAZO("Já faz ${Desbloqueio.PRAZO_DIAS} dias desde a última senha mestra. Digite a senha para continuar."),
    REINICIO("O celular foi reiniciado. Digite a senha mestra."),
    FALHAS("Muitas tentativas falharam. Digite a senha mestra."),
}

/** Regras para oferecer biometria ou PIN do celular. Só metadados; nada aqui é segredo. */
object Desbloqueio {
    const val PRAZO_DIAS = 7
    const val PRAZO_MS = PRAZO_DIAS * 24L * 60 * 60 * 1000
    const val LIMITE_FALHAS = 5

    fun motivo(estado: EstadoBanco, agora: Long, bootAtual: Int): MotivoSenha {
        if (!estado.biometria) return MotivoSenha.SEM_BIOMETRIA
        if (estado.ultimaSenhaMestraEm <= 0L) return MotivoSenha.NUNCA_ABRIU
        if (estado.bootSenhaMestra != bootAtual) return MotivoSenha.REINICIO
        if (estado.falhasDesbloqueio >= LIMITE_FALHAS) return MotivoSenha.FALHAS
        val passou = agora - estado.ultimaSenhaMestraEm
        // Relógio voltado para trás também vence o prazo.
        if (passou < 0 || passou >= PRAZO_MS) return MotivoSenha.PRAZO
        return MotivoSenha.NENHUM
    }

    fun aoAbrirComSenha(estado: EstadoBanco, agora: Long, bootAtual: Int): EstadoBanco =
        estado.copy(ultimaSenhaMestraEm = agora, bootSenhaMestra = bootAtual, falhasDesbloqueio = 0)

    fun aoFalhar(estado: EstadoBanco): EstadoBanco =
        estado.copy(falhasDesbloqueio = (estado.falhasDesbloqueio + 1).coerceAtMost(LIMITE_FALHAS))

    fun aoBloquearSistema(estado: EstadoBanco): EstadoBanco =
        estado.copy(falhasDesbloqueio = LIMITE_FALHAS)

    fun aoAbrirComBiometria(estado: EstadoBanco): EstadoBanco =
        estado.copy(falhasDesbloqueio = 0)

    fun aoDesligar(estado: EstadoBanco): EstadoBanco =
        estado.copy(biometria = false, bioComPin = false, falhasDesbloqueio = 0)
}
