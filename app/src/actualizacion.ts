// Aviso de versión nueva (como en Play Store), sin tienda: el servidor publica el APK en
// /descargas/FitoLens.apk y su versión en /descargas/app.json (despliegue/scripts/publicar_apk.sh).
// Si la versión del servidor es mayor que la de esta app (app.json → expo.version), se ofrece actualizar.
import { Linking, Platform } from 'react-native'
import Constants from 'expo-constants'
import { DownloadTask, File, Paths } from 'expo-file-system'
import * as IntentLauncher from 'expo-intent-launcher'
import { API, enLinea } from './servidor'

export type Novedad = { version: string; tamano_mb?: number; notas?: string }
export const VERSION_APP = Constants.expoConfig?.version ?? '0'
const APK = `${API}/descargas/FitoLens.apk`

// '2.10.0' > '2.9.1'. Compara número por número; lo que no es número cuenta como 0.
export function esMayor(a: string, b: string) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0), pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

// Devuelve la versión nueva o null (sin internet, iPhone, servidor sin APK o ya actualizada).
export async function buscarActualizacion(): Promise<Novedad | null> {
  if (Platform.OS !== 'android' || !(await enLinea())) return null
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(`${API}/descargas/app.json?t=${Date.now()}`, { signal: ctl.signal, headers: { 'Cache-Control': 'no-cache' } })
    const d = r.ok ? await r.json() : null
    return d?.version && esMayor(String(d.version), VERSION_APP) ? d : null
  } catch { return null } finally { clearTimeout(t) }
}

// Descarga el APK (con avance de 0 a 1) y abre el instalador de Android, que pide confirmar.
// Los datos de la app (historial, cuenta) se conservan: es la misma app firmada con la misma llave.
export async function instalarActualizacion(alAvanzar: (p: number) => void) {
  const destino = new File(Paths.cache, 'FitoLens-nueva.apk')
  if (destino.exists) destino.delete()
  try {
    const tarea = new DownloadTask(APK, destino, { onProgress: ({ bytesWritten, totalBytes }) => totalBytes > 0 && alAvanzar(bytesWritten / totalBytes) })
    const f = await tarea.downloadAsync()
    if (!f) throw new Error('Descarga interrumpida')
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: f.contentUri, type: 'application/vnd.android.package-archive', flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    })
  } catch {
    // Plan B: que el navegador descargue el APK; al tocar la notificación se instala igual.
    await Linking.openURL(APK)
  }
}
