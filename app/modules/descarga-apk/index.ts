// Módulo nativo local: descarga de APK en segundo plano con servicio en primer plano de Android.
// En iOS/web exporta funciones vacías para que el código compartido no falle.
import { Platform } from 'react-native'

/** Estado de la descarga reportado por el servicio nativo. */
export type EstadoDescarga = {
  estado: 'inactiva' | 'descargando' | 'pausada' | 'sin_conexion' | 'lista' | 'error'
  bytes: number
  total: number
  version: string
  error?: string
}

const VACIO: EstadoDescarga = { estado: 'inactiva', bytes: 0, total: 0, version: '' }

// Solo cargamos el módulo nativo en Android; en otras plataformas devolvemos stubs.
const esAndroid = Platform.OS === 'android'

// En Expo SDK 52+ el propio módulo nativo emite los eventos (modulo.addListener).
let modulo: any = null

if (esAndroid) {
  try {
    const { requireNativeModule } = require('expo-modules-core')
    modulo = requireNativeModule('DescargaApk')
  } catch { /* módulo no disponible (Expo Go, web, etc.) */ }
}

/** Arranca la descarga del APK en segundo plano. */
export function iniciar(url: string, version: string, sha256?: string | null): void {
  try { modulo?.iniciar(url, version, sha256 ?? '') } catch {}
}

/** Pausa la descarga sin borrar lo descargado. */
export function pausar(): void {
  try { modulo?.pausar() } catch {}
}

/** Reanuda la descarga desde donde se quedó. */
export function reanudar(): void {
  try { modulo?.reanudar() } catch {}
}

/** Cancela la descarga y borra el archivo parcial. */
export function cancelar(): void {
  try { modulo?.cancelar() } catch {}
}

/** Consulta el estado actual de forma síncrona (lee SharedPreferences). */
export function estado(): EstadoDescarga {
  if (!modulo) return VACIO
  try {
    const res = modulo.estado()
    if (!res || typeof res !== 'object') return VACIO
    return {
      estado: res.estado || 'inactiva',
      bytes: Number(res.bytes) || 0,
      total: Number(res.total) || 0,
      version: String(res.version || ''),
      error: res.error ? String(res.error) : undefined,
    }
  } catch {
    return VACIO
  }
}

/** Abre el instalador del APK ya descargado. Devuelve 'ok', 'permiso_requerido', 'archivo_no_encontrado', 'no_lista' o 'error'. */
export function instalar(): string {
  if (!modulo?.instalar) return 'no_disponible'
  try { return String(modulo.instalar()) } catch { return 'error' }
}

/** Comprueba si la app tiene permiso para instalar paquetes desconocidos. */
export function puedeInstalar(): boolean {
  if (!modulo?.puedeInstalar) return true
  try { return !!modulo.puedeInstalar() } catch { return true }
}

/** Abre la pantalla de ajustes de Android para permitir instalar apps desconocidas. */
export function abrirAjustesInstalacion(): boolean {
  if (!modulo?.abrirAjustesInstalacion) return false
  try { return !!modulo.abrirAjustesInstalacion() } catch { return false }
}

/** Disponible: true si el módulo nativo está cargado. */
export const disponible = !!modulo

/**
 * Escucha cambios de estado del servicio (máximo 1 por segundo).
 * Devuelve una función para cancelar la suscripción.
 */
export function escuchar(cb: (e: EstadoDescarga) => void): () => void {
  if (!modulo?.addListener) return () => {}
  try {
    const sub = modulo.addListener('onCambio', (e: any) => {
      try {
        if (!e || typeof e !== 'object') return
        cb({
          estado: e.estado || 'inactiva',
          bytes: Number(e.bytes) || 0,
          total: Number(e.total) || 0,
          version: String(e.version || ''),
          error: e.error ? String(e.error) : undefined,
        })
      } catch {}
    })
    return () => {
      try { sub?.remove?.() } catch {}
    }
  } catch {
    return () => {}
  }
}
