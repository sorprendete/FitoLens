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
  modulo?.iniciar(url, version, sha256 ?? '')
}

/** Pausa la descarga sin borrar lo descargado. */
export function pausar(): void { modulo?.pausar() }

/** Reanuda la descarga desde donde se quedó. */
export function reanudar(): void { modulo?.reanudar() }

/** Cancela la descarga y borra el archivo parcial. */
export function cancelar(): void { modulo?.cancelar() }

/** Consulta el estado actual de forma síncrona (lee SharedPreferences). */
export function estado(): EstadoDescarga {
  if (!modulo) return VACIO
  try { return modulo.estado() as EstadoDescarga } catch { return VACIO }
}

/** Abre el instalador del APK ya descargado. */
export function instalar(): void { modulo?.instalar() }

/** Disponible: true si el módulo nativo está cargado. */
export const disponible = !!modulo

/**
 * Escucha cambios de estado del servicio (máximo 1 por segundo).
 * Devuelve una función para cancelar la suscripción.
 */
export function escuchar(cb: (e: EstadoDescarga) => void): () => void {
  if (!modulo?.addListener) return () => {}
  const sub = modulo.addListener('onCambio', cb)
  return () => sub.remove()
}
