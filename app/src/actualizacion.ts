// Aviso de versión nueva (como en Play Store), sin tienda: el servidor publica el APK en
// /descargas/FitoLens.apk y su versión en /descargas/app.json (despliegue/scripts/publicar_apk.sh).
// Si la versión del servidor es mayor que la de esta app (app.json → expo.version), se ofrece actualizar.
import { Linking, PermissionsAndroid, Platform } from 'react-native'
import Constants from 'expo-constants'
import { API, enLinea } from './servidor'
import { disponible as moduloDisponible, iniciar as iniciarDescarga } from '../modules/descarga-apk'

export type Novedad = { version: string; tamano_mb?: number; notas?: string; sha256?: string }
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

/**
 * Pide permiso de notificaciones (Android 13+) y arranca la descarga en segundo plano
 * con el módulo nativo. Si el módulo no está disponible, abre la URL en el navegador.
 */
export async function instalarActualizacion(novedad: Novedad) {
  // Plan A: módulo nativo de descarga en segundo plano
  if (moduloDisponible) {
    // Pedir permiso de notificaciones en Android 13+ (API 33+)
    if (Platform.OS === 'android' && (Platform.Version as number) >= 33) {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
      } catch { /* si no lo concede, la descarga funciona igual pero sin notificación */ }
    }
    iniciarDescarga(APK, novedad.version, novedad.sha256)
    return
  }

  // Plan B: que el navegador descargue el APK; al tocar la notificación se instala igual.
  await Linking.openURL(APK)
}
