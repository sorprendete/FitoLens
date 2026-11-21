package expo.modules.descargaapk

import android.content.Context
import android.content.SharedPreferences
import java.io.File

/**
 * Almacena el estado de la descarga en SharedPreferences para que persista
 * entre reinicios de la app y para que el módulo JS pueda consultarlo.
 * También emite el evento onCambio hacia JS (máximo 1 vez/segundo, controlado por el servicio).
 */
object EstadoStore {

    private const val PREFS = "descarga_apk_estado"

    /** Listener que el módulo Expo registra para emitir eventos a JS. */
    var listener: ((Map<String, Any?>) -> Unit)? = null

    /** Guarda el estado y notifica al listener. */
    fun guardar(ctx: Context, estado: String, bytes: Long, total: Long, version: String, error: String? = null) {
        prefs(ctx).edit()
            .putString("estado", estado)
            .putLong("bytes", bytes)
            .putLong("total", total)
            .putString("version", version)
            .putString("error", error ?: "")
            .apply()
    }

    /** Notifica al listener JS (el servicio controla que no sea más de 1 vez/seg). */
    fun notificar(ctx: Context) {
        listener?.invoke(leer(ctx))
    }

    /** Lee el estado actual como mapa listo para enviar a JS. */
    fun leer(ctx: Context): Map<String, Any?> {
        val p = prefs(ctx)
        val estado = p.getString("estado", "inactiva") ?: "inactiva"
        val version = p.getString("version", "") ?: ""

        // Si el estado dice 'lista', comprobar que el archivo exista realmente y no esté vacío
        if (estado == "lista") {
            val dir = ctx.getExternalFilesDir("actualizaciones")
            val archivo = if (dir != null && version.isNotBlank()) File(dir, "FitoLens-$version.apk") else null
            if (archivo == null || !archivo.exists() || archivo.length() == 0L) {
                // Estado 'lista' viejo o APK inexistente: limpiar estado
                p.edit().putString("estado", "inactiva").apply()
                return mapOf(
                    "estado" to "inactiva",
                    "bytes" to 0L,
                    "total" to 0L,
                    "version" to "",
                    "error" to null
                )
            }
        }

        return mapOf(
            "estado" to estado,
            "bytes" to p.getLong("bytes", 0L),
            "total" to p.getLong("total", 0L),
            "version" to version,
            "error" to (p.getString("error", "")?.ifBlank { null })
        )
    }

    /** Guarda la URL y sha256 para poder reanudar después de recrear el servicio. */
    fun guardarConfig(ctx: Context, url: String, version: String, sha256: String) {
        prefs(ctx).edit()
            .putString("url", url)
            .putString("version", version)
            .putString("sha256", sha256)
            .apply()
    }

    fun leerConfig(ctx: Context): Triple<String, String, String> {
        val p = prefs(ctx)
        return Triple(
            p.getString("url", "") ?: "",
            p.getString("version", "") ?: "",
            p.getString("sha256", "") ?: ""
        )
    }

    fun limpiar(ctx: Context) {
        prefs(ctx).edit().clear().apply()
    }

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
