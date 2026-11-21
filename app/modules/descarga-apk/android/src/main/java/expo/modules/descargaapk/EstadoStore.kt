package expo.modules.descargaapk

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import java.io.File

/**
 * Almacena el estado de la descarga en SharedPreferences para que persista
 * entre reinicios de la app y para que el módulo JS pueda consultarlo.
 * También emite el evento onCambio hacia JS (máximo 1 vez/segundo, controlado por el servicio).
 */
object EstadoStore {

    private const val TAG = "EstadoStore"
    private const val PREFS = "descarga_apk_estado"

    /** Listener que el módulo Expo registra para emitir eventos a JS. */
    var listener: ((Map<String, Any>) -> Unit)? = null

    /** Guarda el estado y notifica al listener de forma segura. */
    fun guardar(ctx: Context, estado: String, bytes: Long, total: Long, version: String, error: String? = null) {
        try {
            prefs(ctx)?.edit()
                ?.putString("estado", estado)
                ?.putLong("bytes", bytes)
                ?.putLong("total", total)
                ?.putString("version", version)
                ?.putString("error", error ?: "")
                ?.apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error al guardar estado", e)
        }
    }

    /** Notifica al listener JS (el servicio controla que no sea más de 1 vez/seg). */
    fun notificar(ctx: Context) {
        try {
            val datos = leer(ctx)
            listener?.invoke(datos)
        } catch (e: Exception) {
            Log.e(TAG, "Error al notificar estado", e)
        }
    }

    /** Lee el estado actual como mapa listo para enviar a JS SIN valores null. */
    fun leer(ctx: Context): Map<String, Any> {
        val def = mapOf<String, Any>(
            "estado" to "inactiva",
            "bytes" to 0L,
            "total" to 0L,
            "version" to ""
        )
        return try {
            val p = prefs(ctx) ?: return def
            val estado = p.getString("estado", "inactiva") ?: "inactiva"
            val version = p.getString("version", "") ?: ""

            // Si el estado dice 'lista', comprobar que el archivo exista realmente y no esté vacío
            if (estado == "lista") {
                val dir = try { ctx.getExternalFilesDir("actualizaciones") } catch (_: Exception) { null }
                val archivo = if (dir != null && version.isNotBlank()) File(dir, "FitoLens-$version.apk") else null
                val existe = try { archivo != null && archivo.exists() && archivo.length() > 0L } catch (_: Exception) { false }
                if (!existe) {
                    try { p.edit().putString("estado", "inactiva").apply() } catch (_: Exception) {}
                    return def
                }
            }

            val mapa = mutableMapOf<String, Any>(
                "estado" to estado,
                "bytes" to (try { p.getLong("bytes", 0L) } catch (_: Exception) { 0L }),
                "total" to (try { p.getLong("total", 0L) } catch (_: Exception) { 0L }),
                "version" to version
            )
            val err = try { p.getString("error", "") } catch (_: Exception) { "" }
            if (!err.isNullOrBlank()) {
                mapa["error"] = err
            }
            mapa
        } catch (e: Exception) {
            Log.e(TAG, "Error al leer estado", e)
            def
        }
    }

    /** Guarda la URL y sha256 para poder reanudar después de recrear el servicio. */
    fun guardarConfig(ctx: Context, url: String, version: String, sha256: String) {
        try {
            prefs(ctx)?.edit()
                ?.putString("url", url)
                ?.putString("version", version)
                ?.putString("sha256", sha256)
                ?.apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error al guardar config", e)
        }
    }

    fun leerConfig(ctx: Context): Triple<String, String, String> {
        return try {
            val p = prefs(ctx) ?: return Triple("", "", "")
            Triple(
                p.getString("url", "") ?: "",
                p.getString("version", "") ?: "",
                p.getString("sha256", "") ?: ""
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error al leer config", e)
            Triple("", "", "")
        }
    }

    fun limpiar(ctx: Context) {
        try {
            prefs(ctx)?.edit()?.clear()?.apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error al limpiar prefs", e)
        }
    }

    private fun prefs(ctx: Context): SharedPreferences? {
        return try {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        } catch (e: Exception) {
            Log.e(TAG, "Error al acceder a SharedPreferences", e)
            null
        }
    }
}
