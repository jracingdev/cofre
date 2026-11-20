package app.broquel

import org.junit.Assert.assertEquals
import org.junit.Test

class DesbloqueioTest {
    private val agora = 1_800_000_000_000L
    private val ligado = Desbloqueio.aoAbrirComSenha(EstadoBanco(biometria = true), agora, 7)

    @Test
    fun semBiometriaSoSenha() {
        assertEquals(MotivoSenha.SEM_BIOMETRIA, Desbloqueio.motivo(EstadoBanco(), agora, 7))
    }

    @Test
    fun dentroDoPrazoLibera() {
        assertEquals(MotivoSenha.NENHUM, Desbloqueio.motivo(ligado, agora + Desbloqueio.PRAZO_MS - 1, 7))
    }

    @Test
    fun prazoVencido() {
        assertEquals(MotivoSenha.PRAZO, Desbloqueio.motivo(ligado, agora + Desbloqueio.PRAZO_MS, 7))
    }

    @Test
    fun relogioParaTrasVencePrazo() {
        assertEquals(MotivoSenha.PRAZO, Desbloqueio.motivo(ligado, agora - 1, 7))
    }

    @Test
    fun reinicioExigeSenha() {
        assertEquals(MotivoSenha.REINICIO, Desbloqueio.motivo(ligado, agora, 8))
    }

    @Test
    fun cincoFalhasExigemSenha() {
        var estado = ligado
        repeat(Desbloqueio.LIMITE_FALHAS - 1) { estado = Desbloqueio.aoFalhar(estado) }
        assertEquals(MotivoSenha.NENHUM, Desbloqueio.motivo(estado, agora, 7))
        estado = Desbloqueio.aoFalhar(estado)
        assertEquals(MotivoSenha.FALHAS, Desbloqueio.motivo(estado, agora, 7))
        assertEquals(MotivoSenha.FALHAS, Desbloqueio.motivo(Desbloqueio.aoBloquearSistema(ligado), agora, 7))
    }

    @Test
    fun senhaMestraZeraTudo() {
        val falhou = Desbloqueio.aoBloquearSistema(ligado)
        val depois = agora + Desbloqueio.PRAZO_MS * 2
        val aberto = Desbloqueio.aoAbrirComSenha(falhou, depois, 9)
        assertEquals(MotivoSenha.NENHUM, Desbloqueio.motivo(aberto, depois, 9))
        assertEquals(0, aberto.falhasDesbloqueio)
    }

    @Test
    fun metadadosVaoEVoltamSemSegredo() {
        val volta = estadoDeJson(Desbloqueio.aoFalhar(ligado).copy(bioComPin = true).paraJson())
        assertEquals(agora, volta.ultimaSenhaMestraEm)
        assertEquals(7, volta.bootSenhaMestra)
        assertEquals(1, volta.falhasDesbloqueio)
        assertEquals(true, volta.bioComPin)
    }

    @Test
    fun estadoAntigoPedeSenha() {
        val antigo = estadoDeJson("""{"biometria":true,"bloqueioSegundos":60,"itens":[]}""")
        assertEquals(MotivoSenha.NUNCA_ABRIU, Desbloqueio.motivo(antigo, agora, 7))
    }
}
