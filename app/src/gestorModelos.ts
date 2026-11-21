// Gestor de descarga y almacenamiento de modelos especialistas (.onnx)
import { useCallback, useEffect, useState } from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import * as SecureStore from 'expo-secure-store'
import { API } from './servidor'
import { MODELOS_INCLUIDOS } from './modelosIncluidos'
import { CULTIVOS } from './catalogo'

export type GrupoModeloId = 'cafe' | 'cacao' | 'hortalizas' | 'citricos' | 'maiz'

export interface InfoGrupoCultivo {
  id: GrupoModeloId
  nombre: string
  cultivos: string[]
  archivo: string
  tamano_mb: number
  sha256: string
}

export const GRUPOS_MODELO: InfoGrupoCultivo[] = [
  {
    id: 'cafe',
    nombre: 'Café',
    cultivos: ['cafe'],
    archivo: 'cafe.onnx',
    tamano_mb: 53.3,
    sha256: '9acafcf9a1d656c59c06911648abed8a34eacf6535912a92b06b37db0770392e',
  },
  {
    id: 'cacao',
    nombre: 'Cacao',
    cultivos: ['cacao'],
    archivo: 'cacao.onnx',
    tamano_mb: 27.1,
    sha256: '64801bd07cef7fe473a2f17e1037bc4040bda4ecc7f97ffb1662c98d6912500a',
  },
  {
    id: 'hortalizas',
    nombre: 'Hortalizas (Papa, Tomate, Pimiento)',
    cultivos: ['papa', 'tomate', 'pimiento'],
    archivo: 'hortalizas.onnx',
    tamano_mb: 53.3,
    sha256: '751ee390cab2a69b42a1ca7fa529eb89fb366268890222b0e1d050c1283bb412',
  },
  {
    id: 'citricos',
    nombre: 'Cítricos (Limón, Naranja)',
    cultivos: ['limon', 'naranja'],
    archivo: 'citricos.onnx',
    tamano_mb: 70.3,
    sha256: '78ce4727e2906c9d379a188cc39d2dd3469862ac1a4ec84beb7bee4d734e8567',
  },
  {
    id: 'maiz',
    nombre: 'Maíz',
    cultivos: ['maiz'],
    archivo: 'maiz.onnx',
    tamano_mb: 53.3,
    sha256: '181d56cd636ee3617c13d2eb18986a8686b54b4328ef58cccacc4bd83a0e9af4',
  },
]

export const CULTIVO_A_GRUPO: Record<string, GrupoModeloId> = {
  cafe: 'cafe',
  cacao: 'cacao',
  papa: 'hortalizas',
  tomate: 'hortalizas',
  pimiento: 'hortalizas',
  limon: 'citricos',
  naranja: 'citricos',
  maiz: 'maiz',
}

const K_SETUP_INICIAL = 'fitolens_cultivos_configurados'
const CARPETA_MODELOS = (FileSystem.documentDirectory ?? '') + 'modelos/'

export type EstadoDescargaGrupo = {
  progreso: number // 0 a 1
  bytes: number
  total: number
  estado: 'descargando' | 'pausada' | 'error' | 'listo' | 'inactiva'
  error?: string
}

// Mapa de descargas en curso
const descargasActivas: Record<string, FileSystem.DownloadResumable> = {}
const estadosDescarga: Record<string, EstadoDescargaGrupo> = {}
const oyentesDescarga = new Set<(grupoId: string, est: EstadoDescargaGrupo) => void>()
const oyentesCambioModelos = new Set<() => void>()

function notificarDescarga(grupoId: string, est: EstadoDescargaGrupo) {
  estadosDescarga[grupoId] = est
  oyentesDescarga.forEach((fn) => fn(grupoId, est))
}

function notificarCambioModelos() {
  oyentesCambioModelos.forEach((fn) => fn())
}

export function escucharProgreso(fn: (grupoId: string, est: EstadoDescargaGrupo) => void) {
  oyentesDescarga.add(fn)
  return () => { oyentesDescarga.delete(fn) }
}

export function alCambiarModelos(fn: () => void) {
  oyentesCambioModelos.add(fn)
  return () => { oyentesCambioModelos.delete(fn) }
}

export function estadoDescargaActual(grupoId: string): EstadoDescargaGrupo {
  return estadosDescarga[grupoId] ?? { progreso: 0, bytes: 0, total: 0, estado: 'inactiva' }
}

// Verifica si la compilación actual es liviana (solo router en el APK)
export function esVarianteLiviana(): boolean {
  return !MODELOS_INCLUIDOS.cafe && !MODELOS_INCLUIDOS.hortalizas
}

export async function asegurarDirectorioModelos(): Promise<string> {
  const dir = CARPETA_MODELOS
  try {
    const info = await FileSystem.getInfoAsync(dir)
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
    }
  } catch {}
  return dir
}

export function rutaArchivoModelo(archivo: string): string {
  return CARPETA_MODELOS + archivo
}

/**
 * Comprueba si un grupo de modelo está disponible para inferencia (sea incluido en APK o descargado).
 */
export async function estaGrupoDisponible(grupoId: string): Promise<boolean> {
  try {
    if (MODELOS_INCLUIDOS[grupoId]) return true
    const infoGrupo = GRUPOS_MODELO.find((g) => g.id === grupoId)
    if (!infoGrupo) return false
    const ruta = rutaArchivoModelo(infoGrupo.archivo)
    const f = await FileSystem.getInfoAsync(ruta)
    return !!f.exists && (f.size ?? 0) > 1000000
  } catch {
    return false
  }
}

/**
 * Comprueba de forma síncrona si el modelo está incluido en los assets del APK.
 */
export function estaIncluidoEnApk(grupoId: string): boolean {
  return !!MODELOS_INCLUIDOS[grupoId]
}

/**
 * Obtiene la ruta física del archivo ONNX para onnxruntime.
 * Si está en assets, devuelve null para que se use Asset.loadAsync.
 */
export async function rutaLocalDescargada(grupoId: string): Promise<string | null> {
  try {
    const infoGrupo = GRUPOS_MODELO.find((g) => g.id === grupoId)
    if (!infoGrupo) return null
    const ruta = rutaArchivoModelo(infoGrupo.archivo)
    const f = await FileSystem.getInfoAsync(ruta)
    return f.exists && (f.size ?? 0) > 1000000 ? ruta : null
  } catch {
    return null
  }
}

async function verificarSha256(uri: string, shaEsperado: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri)
    if (!info.exists || (info.size ?? 0) < 1000000) return false
    // Si el archivo es grande (> 5MB), leer base64 en JS provoca OutOfMemoryError en Android.
    // Solo usamos digest si es pequeño; de lo contrario validamos existencia y tamaño.
    if (globalThis.crypto?.subtle?.digest && (info.size ?? 0) < 5 * 1024 * 1024) {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
      const binStr = atob(base64)
      const bytes = new Uint8Array(binStr.length)
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
      return hashHex.toLowerCase() === shaEsperado.toLowerCase()
    }
    return true
  } catch {
    try {
      const info = await FileSystem.getInfoAsync(uri)
      return !!info.exists && (info.size ?? 0) > 1000000
    } catch {
      return false
    }
  }
}

/**
 * Inicia o reanuda la descarga de un modelo especialista.
 */
export async function descargarGrupo(grupoId: string): Promise<boolean> {
  const grupo = GRUPOS_MODELO.find((g) => g.id === grupoId)
  if (!grupo) throw new Error(`Grupo desconocido: ${grupoId}`)

  await asegurarDirectorioModelos()
  const urlRemota = `${API}/descargas/modelos/${grupo.archivo}`
  const rutaDestino = rutaArchivoModelo(grupo.archivo)

  notificarDescarga(grupoId, { progreso: 0, bytes: 0, total: Math.round(grupo.tamano_mb * 1024 * 1024), estado: 'descargando' })

  const callback = (descarga: FileSystem.DownloadProgressData) => {
    const total = descarga.totalBytesExpectedToWrite > 0 ? descarga.totalBytesExpectedToWrite : Math.round(grupo.tamano_mb * 1024 * 1024)
    const progreso = total > 0 ? Math.min(1, descarga.totalBytesWritten / total) : 0
    notificarDescarga(grupoId, {
      progreso,
      bytes: descarga.totalBytesWritten,
      total,
      estado: 'descargando',
    })
  }

  try {
    let resumable = descargasActivas[grupoId]
    if (!resumable) {
      resumable = FileSystem.createDownloadResumable(urlRemota, rutaDestino, {}, callback)
      descargasActivas[grupoId] = resumable
    }

    const resultado = await resumable.downloadAsync()
    delete descargasActivas[grupoId]

    if (!resultado?.uri) {
      throw new Error('Descarga no completada')
    }

    // Verificación de integridad
    const shaOk = await verificarSha256(resultado.uri, grupo.sha256)
    if (!shaOk) {
      try { await FileSystem.deleteAsync(resultado.uri, { idempotent: true }) } catch {}
      throw new Error('La verificación del modelo descargado no coincidió. Vuelve a intentarlo.')
    }

    notificarDescarga(grupoId, { progreso: 1, bytes: resultado.status, total: resultado.status, estado: 'listo' })
    notificarCambioModelos()
    return true
  } catch (e: any) {
    delete descargasActivas[grupoId]
    const err = e?.message ?? 'Error al descargar'
    notificarDescarga(grupoId, { progreso: 0, bytes: 0, total: 0, estado: 'error', error: err })
    throw e
  }
}

export async function pausarDescarga(grupoId: string) {
  const r = descargasActivas[grupoId]
  if (r) {
    try {
      await r.pauseAsync()
      const actual = estadoDescargaActual(grupoId)
      notificarDescarga(grupoId, { ...actual, estado: 'pausada' })
    } catch {}
  }
}

export async function reanudarDescarga(grupoId: string) {
  const r = descargasActivas[grupoId]
  if (r) {
    const actual = estadoDescargaActual(grupoId)
    notificarDescarga(grupoId, { ...actual, estado: 'descargando' })
    try {
      await r.resumeAsync()
      delete descargasActivas[grupoId]
      notificarDescarga(grupoId, { progreso: 1, bytes: 1, total: 1, estado: 'listo' })
      notificarCambioModelos()
    } catch (e: any) {
      delete descargasActivas[grupoId]
      notificarDescarga(grupoId, { progreso: 0, bytes: 0, total: 0, estado: 'error', error: e?.message })
    }
  } else {
    await descargarGrupo(grupoId)
  }
}

export async function cancelarDescarga(grupoId: string) {
  const r = descargasActivas[grupoId]
  if (r) {
    try { await r.cancelAsync() } catch {}
    delete descargasActivas[grupoId]
  }
  const grupo = GRUPOS_MODELO.find((g) => g.id === grupoId)
  if (grupo) {
    const ruta = rutaArchivoModelo(grupo.archivo)
    try { await FileSystem.deleteAsync(ruta, { idempotent: true }) } catch {}
  }
  notificarDescarga(grupoId, { progreso: 0, bytes: 0, total: 0, estado: 'inactiva' })
  notificarCambioModelos()
}

export async function borrarModeloDescargado(grupoId: string): Promise<void> {
  const grupo = GRUPOS_MODELO.find((g) => g.id === grupoId)
  if (!grupo) return
  const ruta = rutaArchivoModelo(grupo.archivo)
  try {
    await FileSystem.deleteAsync(ruta, { idempotent: true })
  } catch {}
  notificarDescarga(grupoId, { progreso: 0, bytes: 0, total: 0, estado: 'inactiva' })
  notificarCambioModelos()
}

export async function haCompletadoSetupInicial(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(K_SETUP_INICIAL)
    return val === '1'
  } catch {
    return false
  }
}

export async function marcarSetupInicialCompletado(): Promise<void> {
  try {
    await SecureStore.setItemAsync(K_SETUP_INICIAL, '1')
  } catch {}
}

function formatearNombres(nombres: string[]): string {
  if (nombres.length === 0) return 'Ninguno'
  if (nombres.length === 1) return nombres[0]
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * Hook reactivo que provee los modelos y cultivos actualmente instalados en el teléfono.
 * Se actualiza en tiempo real al descargar o borrar cualquier modelo.
 */
export function useCultivosInstalados() {
  const [gruposInstaladosIds, setGruposInstaladosIds] = useState<GrupoModeloId[]>([])
  const [cargando, setCargando] = useState(true)

  const refrescar = useCallback(async () => {
    try {
      const listos: GrupoModeloId[] = []
      for (const g of GRUPOS_MODELO) {
        try {
          if (await estaGrupoDisponible(g.id)) {
            listos.push(g.id)
          }
        } catch {}
      }
      setGruposInstaladosIds(listos)
    } catch {} finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    refrescar()
    const quitarCambio = alCambiarModelos(refrescar)
    const quitarProgreso = escucharProgreso((_id, est) => {
      if (est.estado === 'listo' || est.estado === 'inactiva') {
        refrescar()
      }
    })
    return () => {
      quitarCambio()
      quitarProgreso()
    }
  }, [refrescar])

  const gruposInstalados = GRUPOS_MODELO.filter((g) => gruposInstaladosIds.includes(g.id))
  const gruposDisponibles = GRUPOS_MODELO.filter((g) => !gruposInstaladosIds.includes(g.id))

  // Lista de identificadores de cultivos instalados (ej. 'cafe', 'cacao', 'papa')
  const cultivosInstalados = Object.keys(CULTIVOS).filter((cId) => {
    const grupo = CULTIVO_A_GRUPO[cId]
    return grupo ? gruposInstaladosIds.includes(grupo) : false
  })

  // Lista de identificadores de cultivos disponibles para descargar
  const cultivosDisponibles = Object.keys(CULTIVOS).filter((cId) => !cultivosInstalados.includes(cId))

  const nombresCultivosInstalados = cultivosInstalados.map((id) => CULTIVOS[id]?.nombre ?? id)
  const nombresCultivosDisponibles = cultivosDisponibles.map((id) => CULTIVOS[id]?.nombre ?? id)

  const textoDetecta = formatearNombres(nombresCultivosInstalados)

  const esCultivoInstalado = useCallback(
    (cultivoId: string) => {
      const g = CULTIVO_A_GRUPO[cultivoId]
      return g ? gruposInstaladosIds.includes(g) : false
    },
    [gruposInstaladosIds]
  )

  const esGrupoInstalado = useCallback(
    (grupoId: GrupoModeloId) => gruposInstaladosIds.includes(grupoId),
    [gruposInstaladosIds]
  )

  return {
    gruposInstalados,
    gruposDisponibles,
    cultivosInstalados,
    cultivosDisponibles,
    nombresCultivosInstalados,
    nombresCultivosDisponibles,
    textoDetecta,
    totalInstalados: gruposInstalados.length,
    totalGrupos: GRUPOS_MODELO.length,
    esCultivoInstalado,
    esGrupoInstalado,
    cargando,
    refrescar,
  }
}
