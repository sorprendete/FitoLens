package expo.modules.descargaapk

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

/**
 * Módulo Expo que expone la API de descarga de APK en segundo plano a JavaScript.
 * Funciones: iniciar, pausar, reanudar, cancelar, estado, instalar.
 * Evento: onCambio (emitido desde DescargaService vía EstadoStore).
 */
class DescargaApkModule : Module() {

    override fun definition() = ModuleDefinition {

        Name("DescargaApk")

        Events("onCambio")

        // Al crear el módulo, registrar el listener de cambios de estado.
        OnCreate {
            EstadoStore.listener = { mapa ->
                try { sendEvent("onCambio", mapa) } catch (_: Exception) {}
            }
        }

        OnDestroy {
            EstadoStore.listener = null
        }

        Function("iniciar") { url: String, version: String, sha256: String ->
            val ctx = appContext.reactContext
            if (ctx != null) {
                val intent = Intent(ctx, DescargaService::class.java).apply {
                    action = DescargaService.CMD_INICIAR
                    putExtra("url", url)
                    putExtra("version", version)
                    putExtra("sha256", sha256)
                }
                ContextCompat.startForegroundService(ctx, intent)
            }
        }

        Function("pausar") {
            enviarComando(DescargaService.CMD_PAUSAR)
        }

        Function("reanudar") {
            enviarComando(DescargaService.CMD_REANUDAR)
        }

        Function("cancelar") {
            enviarComando(DescargaService.CMD_CANCELAR)
        }

        Function("estado") {
            val ctx = appContext.reactContext
            if (ctx != null) EstadoStore.leer(ctx)
            else mapOf("estado" to "inactiva", "bytes" to 0L, "total" to 0L, "version" to "")
        }

        Function("instalar") {
            val ctx = appContext.reactContext
            if (ctx != null) {
                val datos = EstadoStore.leer(ctx)
                val version = datos["version"] as? String
                if (datos["estado"] == "lista" && version != null) abrirInstalador(ctx, version)
            }
        }
    }

    private fun enviarComando(accion: String) {
        val ctx = appContext.reactContext ?: return
        val intent = Intent(ctx, DescargaService::class.java).apply { action = accion }
        ctx.startService(intent)
    }

    companion object {
        /** Abre el instalador de Android para el APK descargado. */
        fun abrirInstalador(ctx: Context, version: String) {
            val dir = ctx.getExternalFilesDir("actualizaciones") ?: return
            val archivo = File(dir, "FitoLens-$version.apk")
            if (!archivo.exists()) return

            val authority = "${ctx.packageName}.descargaapk.fileprovider"
            val uri: Uri = FileProvider.getUriForFile(ctx, authority, archivo)

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(intent)
        }
    }
}
