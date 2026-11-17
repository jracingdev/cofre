package app.broquel

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PacoteTest {
    @Test
    fun oAplicativoSeChamaBroquel() {
        val contexto = ApplicationProvider.getApplicationContext<android.content.Context>()
        assertEquals("app.broquel", contexto.packageName)
        assertEquals("Broquel", contexto.applicationInfo.loadLabel(contexto.packageManager).toString())
    }
}
