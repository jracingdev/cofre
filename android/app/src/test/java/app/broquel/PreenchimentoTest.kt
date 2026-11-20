package app.broquel

import app.broquel.autofill.Origem
import app.broquel.autofill.Preenchimento
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PreenchimentoTest {
    private val banco = Origem("login.banco.com.br", "com.android.chrome")

    @Test
    fun mesmoSiteESubdominio() {
        assertTrue(Preenchimento.combina("https://banco.com.br", banco))
        assertTrue(Preenchimento.combina("banco.com.br/entrar", banco))
        assertTrue(Preenchimento.combina("https://www.login.banco.com.br", banco))
    }

    @Test
    fun siteParecidoNaoCombina() {
        assertFalse(Preenchimento.combina("https://banco.com.br.golpe.com", banco))
        assertFalse(Preenchimento.combina("https://outrobanco.com.br", banco))
        assertFalse(Preenchimento.combina("https://com.br", banco))
        assertFalse(Preenchimento.combina("", banco))
    }

    @Test
    fun appSoPeloPacote() {
        val app = Origem(null, "br.com.banco.app")
        assertTrue(Preenchimento.combina("androidapp://br.com.banco.app", app))
        assertFalse(Preenchimento.combina("https://banco.com.br", app))
        assertFalse(Preenchimento.combina("androidapp://br.com.golpe", app))
    }

    @Test
    fun urlGuardada() {
        assertEquals("https://login.banco.com.br", banco.url)
        assertEquals("androidapp://br.com.banco.app", Origem(null, "br.com.banco.app").url)
    }
}
