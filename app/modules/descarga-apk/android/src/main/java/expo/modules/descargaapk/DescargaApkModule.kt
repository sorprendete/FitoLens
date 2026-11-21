package expo.modules.descargaapk

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
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
                try {
                    sendEvent("onCambio", mapa)
                } catch (e: Exception) {
                    Log.e("DescargaApkModule", "Error enviando onCambio", e)
                }
            }
        }

        OnDestroy {
            EstadoStore.listener = null
        }

        Function("iniciar") { url: String, version: String, sha256: String ->
            val ctx = appContext.reactContext
            if (ctx != null) {
                try {
                    val intent = Intent(ctx, DescargaService::class.java).apply {
                        action = DescargaService.CMD_INICIAR
                        putExtra("url", url)
                        putExtra("version", version)
                        putExtra("sha256", sha256)
                    }
                    ContextCompat.startForegroundService(ctx, intent)
                } catch (e: Exception) {
                    Log.e("DescargaApkModule", "Error al iniciar foreground service", e)
                    EstadoStore.guardar(ctx, "error", 0L, 0L, version, "No se pudo iniciar el servicio de descarga")
                    EstadoStore.notificar(ctx)
                }
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
            try {
                val ctx = appContext.reactContext
                if (ctx != null) {
                    EstadoStore.leer(ctx)
                } else {
                    mapOf("estado" to "inactiva", "bytes" to 0L, "total" to 0L, "version" to "")
                }
            } catch (e: Exception) {
                Log.e("DescargaApkModule", "Error al obtener estado", e)
                mapOf("estado" to "inactiva", "bytes" to 0L, "total" to 0L, "version" to "")
            }
        }

        Function("puedeInstalar") {
            try {
                val ctx = appContext.reactContext
                if (ctx != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ctx.packageManager.canRequestPackageInstalls()
                } else {
                    true
                }
            } catch (e: Exception) {
                Log.e("DescargaApkModule", "Error en puedeInstalar", e)
                true
            }
        }

        Function("abrirAjustesInstalacion") {
            val ctx = appContext.reactContext ?: return@Function false
            abrirAjustesPermiso(ctx)
        }

        Function("instalar") {
            try {
                val ctx = appContext.reactContext ?: return@Function "sin_contexto"
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.packageManager.canRequestPackageInstalls()) {
                    abrirAjustesPermiso(ctx)
                    return@Function "permiso_requerido"
                }
                val datos = EstadoStore.leer(ctx)
                val version = datos["version"] as? String
                if (datos["estado"] == "lista" && !version.isNullOrBlank()) {
                    val ok = abrirInstalador(ctx, version)
                    if (ok) "ok" else "archivo_no_encontrado"
                } else {
                    "no_lista"
                }
            } catch (e: Exception) {
                Log.e("DescargaApkModule", "Error en instalar", e)
                "error"
            }
        }
    }

    private fun enviarComando(accion: String) {
        val ctx = appContext.reactContext ?: return
        try {
            val intent = Intent(ctx, DescargaService::class.java).apply { action = accion }
            ctx.startService(intent)
        } catch (e: Exception) {
            Log.e("DescargaApkModule", "Error enviando comando $accion", e)
        }
    }

    companion object {
        fun abrirAjustesPermiso(ctx: Context): Boolean {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:${ctx.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                return try {
                    ctx.startActivity(intent)
                    true
                } catch (_: Exception) {
                    try {
                        ctx.startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
                        true
                    } catch (_: Exception) {
                        false
                    }
                }
            }
            return false
        }

        /** Abre el instalador de Android para el APK descargado. */
        fun abrirInstalador(ctx: Context, version: String): Boolean {
            return try {
                val dir = ctx.getExternalFilesDir("actualizaciones") ?: return false
                val archivo = File(dir, "FitoLens-$version.apk")
                if (!archivo.exists() || archivo.length() == 0L) return false

                val authority = "${ctx.packageName}.descargaapk.fileprovider"
                val uri: Uri = FileProvider.getUriForFile(ctx, authority, archivo)

                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                ctx.startActivity(intent)
                true
            } catch (e: Exception) {
                Log.e("DescargaApkModule", "Error al abrir instalador", e)
                false
            }
        }
    }
}
