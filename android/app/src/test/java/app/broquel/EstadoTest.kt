package app.broquel

import app.broquel.cripto.AcaoConflito
import app.broquel.cripto.decidirConflito
import org.junit.Assert.assertEquals
import org.junit.Test

class EstadoTest {
    @Test
    fun conflitoNaoPerdeEdicao() {
        assertEquals(AcaoConflito.ReenviarEdicaoLocal, decidirConflito(false, true, false, true))
        assertEquals(AcaoConflito.Bifurcar, decidirConflito(false, false, false, false))
    }

    @Test
    fun conteudoVaiEVolta() {
        val original = ConteudoLogin("Banco", "ana", "segredo", "https://banco", "", "abc")
        assertEquals("Banco", conteudoDe(original.paraBytes()).titulo)
        assertEquals("abc", conteudoDe(original.paraBytes()).conflitoDe)
    }

    @Test
    fun jsonDoLoginIgualAoContratoDaWeb() {
        val texto = ConteudoLogin("Banco", "ana", "segredo", "https://banco", "", null).paraBytes().toString(Charsets.UTF_8)
        assertEquals(
            """{"v":1,"tipo":"login","titulo":"Banco","campos":{"usuario":"ana","senha":"segredo","url":"https://banco","notas":""},"conflito_de":null}""",
            texto,
        )
    }
}
