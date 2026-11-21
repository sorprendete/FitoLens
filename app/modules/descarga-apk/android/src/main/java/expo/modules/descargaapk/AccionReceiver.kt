package expo.modules.descargaapk

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.io.File

/**
 * Receiver interno para los botones de la notificación (Pausar, Reanudar, Cancelar).
 */
class AccionReceiver : BroadcastReceiver() {

    companion object {
        const val ACCION_PAUSAR = "expo.modules.descargaapk.PAUSAR"
        const val ACCION_REANUDAR = "expo.modules.descargaapk.REANUDAR"
        const val ACCION_CANCELAR = "expo.modules.descargaapk.CANCELAR"
        private const val TAG = "AccionReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        try {
            val cmd = Intent(context, DescargaService::class.java)
            when (intent.action) {
                ACCION_PAUSAR -> cmd.action = DescargaService.CMD_PAUSAR
                ACCION_REANUDAR -> cmd.action = DescargaService.CMD_REANUDAR
                ACCION_CANCELAR -> cmd.action = DescargaService.CMD_CANCELAR
                else -> return
            }

            if (cmd.action == DescargaService.CMD_REANUDAR) {
                try {
                    // Reanudar vuelve a primer plano
                    androidx.core.content.ContextCompat.startForegroundService(context, cmd)
                } catch (e: Exception) {
                    Log.e(TAG, "No se pudo reanudar servicio en primer plano", e)
                }
                return
            }

            try {
                context.startService(cmd)
            } catch (e: Exception) {
                Log.e(TAG, "No se pudo enviar comando $cmd a DescargaService", e)
                // Si el sistema no permite arrancar el servicio y se pidió cancelar: limpiar localmente
                if (cmd.action == DescargaService.CMD_CANCELAR) {
                    limpiarLocal(context)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error general en AccionReceiver", e)
        }
    }

    private fun limpiarLocal(context: Context) {
        try {
            val (_, version, _) = EstadoStore.leerConfig(context)
            context.getExternalFilesDir("actualizaciones")?.let { dir ->
                try { File(dir, "FitoLens-$version.apk").delete() } catch (_: Exception) {}
            }
            EstadoStore.limpiar(context)
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)?.cancel(9201)
        } catch (_: Exception) {}
    }
}
