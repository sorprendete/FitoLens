package expo.modules.descargaapk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Servicio en primer plano que descarga el APK de actualización.
 * - Reanudable (HTTP Range).
 * - Notificación con barra de progreso y botones Pausar/Reanudar/Cancelar.
 * - WakeLock + WifiLock mientras descarga.
 * - Detecta pérdida/recuperación de red.
 * - Al terminar, verifica tamaño (y sha256 si se proporcionó) y abre el instalador.
 */
class DescargaService : Service() {

    companion object {
        const val CMD_INICIAR = "expo.modules.descargaapk.INICIAR"
        const val CMD_PAUSAR = "expo.modules.descargaapk.CMD_PAUSAR"
        const val CMD_REANUDAR = "expo.modules.descargaapk.CMD_REANUDAR"
        const val CMD_CANCELAR = "expo.modules.descargaapk.CMD_CANCELAR"

        private const val TAG = "DescargaService"
        private const val CANAL_ID = "actualizaciones"
        private const val NOTIF_ID = 9201
        private const val BUFFER = 8192
    }

    // Parámetros de la descarga
    private var url = ""
    private var version = ""
    private var sha256Esperado = ""

    // Estado
    private var bytesDescargados = 0L
    private var totalBytes = 0L
    @Volatile private var pausado = false
    @Volatile private var cancelado = false
    @Volatile private var descargando = false

    // Hilo de descarga
    private var hiloDescarga: Thread? = null

    // Locks
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    // Red
    private var connectivityManager: ConnectivityManager? = null
    private var callbackRed: ConnectivityManager.NetworkCallback? = null
    @Volatile private var hayRed = true

    // Notificación: controlar que no se actualice más de 1 vez/segundo
    private var ultimaNotif = 0L
    private var ultimoEventoJs = 0L

    // Velocidad media: bytes acumulados y tiempo del tramo actual de descarga
    private var bytesTramo = 0L
    private var inicioTramo = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        crearCanal()
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            CMD_INICIAR -> {
                url = intent.getStringExtra("url") ?: ""
                version = intent.getStringExtra("version") ?: ""
                sha256Esperado = intent.getStringExtra("sha256") ?: ""
                if (url.isBlank()) { stopSelf(); return START_NOT_STICKY }

                EstadoStore.guardarConfig(this, url, version, sha256Esperado)
                cancelado = false
                pausado = false
                iniciarPrimerPlano()
                iniciarDescarga()
            }
            CMD_PAUSAR -> pausar()
            CMD_REANUDAR -> {
                // Leer config guardada por si el servicio fue recreado
                if (url.isBlank()) {
                    val (u, v, s) = EstadoStore.leerConfig(this)
                    url = u; version = v; sha256Esperado = s
                }
                reanudar()
            }
            CMD_CANCELAR -> cancelar()
        }
        return START_NOT_STICKY
    }

    // ── Primer plano ──────────────────────────────────────────────────────

    private fun iniciarPrimerPlano() {
        val notif = construirNotifProgreso(0, 0, "Preparando…")
        if (Build.VERSION.SDK_INT >= 34) {
            ServiceCompat.startForeground(
                this, NOTIF_ID, notif,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    // ── Descarga ──────────────────────────────────────────────────────────

    private fun iniciarDescarga() {
        if (descargando) return
        descargando = true
        adquirirLocks()
        registrarCallbackRed()

        hiloDescarga = Thread {
            try {
                descargar()
            } catch (e: Exception) {
                if (!cancelado && !pausado) {
                    Log.e(TAG, "Error de descarga", e)
                    manejarErrorRed()
                }
            } finally {
                descargando = false
            }
        }.apply { start() }
    }

    private fun descargar() {
        val dir = getExternalFilesDir("actualizaciones")
            ?: throw RuntimeException("No se pudo acceder al almacenamiento")
        if (!dir.exists()) dir.mkdirs()

        val archivo = File(dir, "FitoLens-$version.apk")
        bytesDescargados = if (archivo.exists()) archivo.length() else 0L

        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 30_000
            readTimeout = 30_000
            if (bytesDescargados > 0) setRequestProperty("Range", "bytes=$bytesDescargados-")
        }

        try {
            val codigo = conn.responseCode

            // Si el servidor no soporta Range, empezar de cero
            if (bytesDescargados > 0 && codigo == 200) {
                bytesDescargados = 0
                archivo.delete()
            }

            if (codigo != 200 && codigo != 206) {
                throw RuntimeException("HTTP $codigo")
            }

            val contentLength = conn.getHeaderField("Content-Length")?.toLongOrNull() ?: -1L
            totalBytes = if (codigo == 206) {
                // Content-Range: bytes inicio-fin/total
                val rango = conn.getHeaderField("Content-Range")
                rango?.substringAfter("/")?.toLongOrNull() ?: (bytesDescargados + contentLength)
            } else {
                contentLength
            }

            actualizarEstado("descargando")

            val entrada = BufferedInputStream(conn.inputStream, BUFFER)
            val salida = if (bytesDescargados > 0 && codigo == 206) {
                FileOutputStream(archivo, true) // append
            } else {
                FileOutputStream(archivo)
            }

            inicioTramo = System.currentTimeMillis()
            bytesTramo = 0

            val buffer = ByteArray(BUFFER)
            var leidos: Int

            entrada.use { inp ->
                salida.use { out ->
                    while (inp.read(buffer).also { leidos = it } != -1) {
                        if (cancelado || pausado) return

                        out.write(buffer, 0, leidos)
                        bytesDescargados += leidos
                        bytesTramo += leidos

                        notificarProgreso()
                    }
                }
            }

            // Descarga completa: verificar
            if (cancelado || pausado) return
            verificarYFinalizar(archivo)

        } finally {
            conn.disconnect()
            if (!pausado) liberarLocks()
        }
    }

    private fun verificarYFinalizar(archivo: File) {
        // Verificar tamaño
        if (totalBytes > 0 && archivo.length() != totalBytes) {
            actualizarEstado("error", error = "Tamaño incorrecto: ${archivo.length()} ≠ $totalBytes")
            archivo.delete()
            mostrarNotifError("Error en la descarga")
            desregistrarCallbackRed()
            stopSelf()
            return
        }

        // Verificar sha256 si se proporcionó
        if (sha256Esperado.isNotBlank()) {
            val hash = calcularSha256(archivo)
            if (!hash.equals(sha256Esperado, ignoreCase = true)) {
                actualizarEstado("error", error = "SHA-256 no coincide")
                archivo.delete()
                mostrarNotifError("Archivo corrupto")
                desregistrarCallbackRed()
                stopSelf()
                return
            }
        }

        // ¡Listo!
        desregistrarCallbackRed()
        liberarLocks()
        actualizarEstado("lista")
        mostrarNotifLista()

        // Intentar abrir el instalador directamente
        try { DescargaApkModule.abrirInstalador(this, version) } catch (_: Exception) {}
    }

    private fun calcularSha256(archivo: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        archivo.inputStream().use { inp ->
            val buf = ByteArray(BUFFER)
            var n: Int
            while (inp.read(buf).also { n = it } != -1) digest.update(buf, 0, n)
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    // ── Pausar / Reanudar / Cancelar ──────────────────────────────────────

    private fun pausar() {
        pausado = true
        hiloDescarga?.interrupt()
        hiloDescarga = null
        liberarLocks()
        actualizarEstado("pausada")
        mostrarNotifPausa("En pausa · ${porcentaje()}%")
        // Sale de primer plano pero la notificación queda
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
    }

    private fun reanudar() {
        // Siempre volver a primer plano primero: si el servicio se arrancó con startForegroundService,
        // Android exige startForeground() en pocos segundos aunque la descarga ya esté en curso.
        iniciarPrimerPlano()
        if (descargando) return
        pausado = false
        cancelado = false
        iniciarDescarga()
    }

    private fun cancelar() {
        cancelado = true
        pausado = false
        hiloDescarga?.interrupt()
        hiloDescarga = null
        liberarLocks()
        desregistrarCallbackRed()

        // Borrar archivo parcial
        val dir = getExternalFilesDir("actualizaciones")
        if (dir != null) File(dir, "FitoLens-$version.apk").delete()

        EstadoStore.limpiar(this)
        actualizarEstado("inactiva")

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIF_ID)
        stopSelf()
    }

    // ── Manejo de red ─────────────────────────────────────────────────────

    private fun manejarErrorRed() {
        pausado = true
        hiloDescarga = null
        liberarLocks()
        actualizarEstado("sin_conexion")
        mostrarNotifPausa("En pausa (sin conexión) · ${porcentaje()}%")
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
    }

    private fun registrarCallbackRed() {
        if (callbackRed != null) return
        val req = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        callbackRed = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                hayRed = true
                // Si estaba esperando conexión, reanudar automáticamente
                if (pausado && !cancelado && !descargando) {
                    val estadoActual = EstadoStore.leer(this@DescargaService)
                    if (estadoActual["estado"] == "sin_conexion") {
                        reanudar()
                    }
                }
            }
            override fun onLost(network: Network) {
                hayRed = false
            }
        }
        try { connectivityManager?.registerNetworkCallback(req, callbackRed!!) } catch (_: Exception) {}
    }

    private fun desregistrarCallbackRed() {
        callbackRed?.let {
            try { connectivityManager?.unregisterNetworkCallback(it) } catch (_: Exception) {}
            callbackRed = null
        }
    }

    // ── Locks ─────────────────────────────────────────────────────────────

    private fun adquirirLocks() {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fitolens:descarga").apply {
                acquire(3 * 60 * 60 * 1000L) // máximo 3 horas (APK grande con señal lenta)
            }
        }
        if (wifiLock == null) {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "fitolens:descarga").apply {
                acquire()
            }
        }
    }

    private fun liberarLocks() {
        wakeLock?.let { if (it.isHeld) it.release(); wakeLock = null }
        wifiLock?.let { if (it.isHeld) it.release(); wifiLock = null }
    }

    // ── Notificaciones ────────────────────────────────────────────────────

    private fun crearCanal() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val canal = NotificationChannel(
                CANAL_ID, "Actualizaciones", NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Progreso de descarga de actualizaciones"
                setSound(null, null)
                enableVibration(false)
            }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(canal)
        }
    }

    private fun construirNotifProgreso(progreso: Int, maximo: Int, texto: String): Notification {
        return NotificationCompat.Builder(this, CANAL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Actualizando FitoLens $version")
            .setContentText(texto)
            .setProgress(maximo, progreso, maximo == 0)
            .setOngoing(true)
            .setSilent(true)
            .addAction(0, "Pausar", pendingIntentAccion(AccionReceiver.ACCION_PAUSAR))
            .addAction(0, "Cancelar", pendingIntentAccion(AccionReceiver.ACCION_CANCELAR))
            .build()
    }

    private fun mostrarNotifPausa(texto: String) {
        val notif = NotificationCompat.Builder(this, CANAL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Actualizando FitoLens $version")
            .setContentText(texto)
            .setProgress(100, porcentaje(), false)
            .setOngoing(false)
            .setSilent(true)
            .addAction(0, "Reanudar", pendingIntentAccion(AccionReceiver.ACCION_REANUDAR))
            .addAction(0, "Cancelar", pendingIntentAccion(AccionReceiver.ACCION_CANCELAR))
            .build()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIF_ID, notif)
    }

    private fun mostrarNotifLista() {
        // PendingIntent que abre el instalador al tocar la notificación
        val dir = getExternalFilesDir("actualizaciones") ?: return
        val archivo = File(dir, "FitoLens-$version.apk")
        val authority = "${packageName}.descargaapk.fileprovider"
        val uri = androidx.core.content.FileProvider.getUriForFile(this, authority, archivo)

        val intentInstalar = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val pi = PendingIntent.getActivity(
            this, 0, intentInstalar,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif = NotificationCompat.Builder(this, CANAL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("FitoLens $version lista para instalar")
            .setContentText("Toca para instalar")
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setOngoing(false)
            .setSilent(true)
            .build()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIF_ID, notif)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
        stopSelf()
    }

    private fun mostrarNotifError(texto: String) {
        val notif = NotificationCompat.Builder(this, CANAL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle("Error de actualización")
            .setContentText(texto)
            .setOngoing(false)
            .setSilent(true)
            .build()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIF_ID, notif)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
        stopSelf()
    }

    private fun pendingIntentAccion(accion: String): PendingIntent {
        val intent = Intent(this, AccionReceiver::class.java).apply { this.action = accion }
        return PendingIntent.getBroadcast(
            this, accion.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    // ── Progreso y estado ─────────────────────────────────────────────────

    private fun notificarProgreso() {
        val ahora = System.currentTimeMillis()
        // Máximo 1 actualización por segundo
        if (ahora - ultimaNotif < 1000) return
        ultimaNotif = ahora

        val pct = porcentaje()
        val texto = textoProgreso()

        // Actualizar notificación
        val notif = construirNotifProgreso(pct, 100, texto)
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIF_ID, notif)

        // Guardar y emitir evento a JS
        actualizarEstado("descargando")
    }

    private fun textoProgreso(): String {
        val pct = porcentaje()
        val descMB = bytesDescargados / (1024.0 * 1024.0)
        val totalMB = if (totalBytes > 0) totalBytes / (1024.0 * 1024.0) else 0.0

        val sb = StringBuilder()
        sb.append("$pct %")
        if (totalBytes > 0) {
            sb.append(" · ${formatoMB(descMB)} de ${formatoMB(totalMB)} MB")
        }

        // Tiempo restante
        val transcurrido = System.currentTimeMillis() - inicioTramo
        if (transcurrido > 2000 && bytesTramo > 0 && totalBytes > 0) {
            val velocidad = bytesTramo.toDouble() / (transcurrido / 1000.0)
            val restante = totalBytes - bytesDescargados
            if (velocidad > 0) {
                val segsRestantes = (restante / velocidad).toLong()
                sb.append(" · faltan ~${formatoTiempo(segsRestantes)}")
            }
        }

        return sb.toString()
    }

    private fun porcentaje(): Int =
        if (totalBytes > 0) ((bytesDescargados * 100) / totalBytes).toInt().coerceIn(0, 100) else 0

    private fun formatoMB(mb: Double): String =
        if (mb >= 1.0) "%.0f".format(mb) else "%.1f".format(mb)

    private fun formatoTiempo(segs: Long): String = when {
        segs < 60 -> "${segs}s"
        segs < 3600 -> "${segs / 60} min"
        else -> "${segs / 3600}h ${(segs % 3600) / 60} min"
    }

    private fun actualizarEstado(estado: String, error: String? = null) {
        EstadoStore.guardar(this, estado, bytesDescargados, totalBytes, version, error)
        val ahora = System.currentTimeMillis()
        if (ahora - ultimoEventoJs >= 1000 || estado != "descargando") {
            ultimoEventoJs = ahora
            EstadoStore.notificar(this)
        }
    }

    override fun onDestroy() {
        cancelado = true
        hiloDescarga?.interrupt()
        liberarLocks()
        desregistrarCallbackRed()
        super.onDestroy()
    }
}
