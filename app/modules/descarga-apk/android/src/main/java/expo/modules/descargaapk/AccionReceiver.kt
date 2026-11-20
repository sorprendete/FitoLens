package expo.modules.descargaapk

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Receiver interno para los botones de la notificación (Pausar, Reanudar, Cancelar).
 */
class AccionReceiver : BroadcastReceiver() {

    companion object {
        const val ACCION_PAUSAR = "expo.modules.descargaapk.PAUSAR"
        const val ACCION_REANUDAR = "expo.modules.descargaapk.REANUDAR"
        const val ACCION_CANCELAR = "expo.modules.descargaapk.CANCELAR"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val cmd = Intent(context, DescargaService::class.java)
        when (intent.action) {
            ACCION_PAUSAR -> cmd.action = DescargaService.CMD_PAUSAR
            ACCION_REANUDAR -> cmd.action = DescargaService.CMD_REANUDAR
            ACCION_CANCELAR -> cmd.action = DescargaService.CMD_CANCELAR
            else -> return
        }
        if (cmd.action == DescargaService.CMD_REANUDAR) {
            // Reanudar vuelve a primer plano: con la app cerrada solo se permite así (Android 8+).
            androidx.core.content.ContextCompat.startForegroundService(context, cmd)
            return
        }
        try {
            context.startService(cmd)
        } catch (_: IllegalStateException) {
            // El sistema ya cerró el servicio (la app está en segundo plano): Cancelar se resuelve aquí mismo.
            if (cmd.action == DescargaService.CMD_CANCELAR) {
                val (_, version, _) = EstadoStore.leerConfig(context)
                context.getExternalFilesDir("actualizaciones")?.let { java.io.File(it, "FitoLens-$version.apk").delete() }
                EstadoStore.limpiar(context)
                (context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).cancel(9201)
            }
        }
    }
}
