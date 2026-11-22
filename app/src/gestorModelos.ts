// Gestor de descarga y almacenamiento de modelos especialistas (.onnx)
import { useCallback, useEffect, useState } from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import * as SecureStore from 'expo-secure-store'
import { API, enLinea } from './servidor'
import { MODELOS_INCLUIDOS } from './modelosIncluidos'
import { CULTIVOS } from './catalogo'
import { verificarParaDescargarModelos } from './actualizacion'

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
    nombre: 'Papa, tomate y pimiento',
    cultivos: ['papa', 'tomate', 'pimiento'],
    archivo: 'hortalizas.onnx',
    tamano_mb: 53.3,
    sha256: '751ee390cab2a69b42a1ca7fa529eb89fb366268890222b0e1d050c1283bb412',
  },
  {
    id: 'citricos',
    nombre: 'Limón y naranja',
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

export const ORDEN_PLANTAS = ['limon', 'naranja', 'papa', 'tomate', 'pimiento', 'cafe', 'cacao', 'maiz']

export function plantasDeGrupo(grupo: string): string[] {
  const g = (grupo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (g === 'citricos' || g === 'citrico') return ['Limón', 'Naranja']
  if (g === 'hortalizas' || g === 'hortaliza') return ['Papa', 'Tomate', 'Pimiento']
  if (g === 'cafe') return ['Café']
  if (g === 'cacao') return ['Cacao']
  if (g === 'maiz') return ['Maíz']
  return CULTIVOS[grupo]?.nombre ? [CULTIVOS[grupo].nombre] : [grupo]
}

export function nombreVisibleGrupo(grupo: string): string {
  const g = (grupo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (g === 'citricos' || g === 'citrico') return 'Limón y naranja'
  if (g === 'hortalizas' || g === 'hortaliza') return 'Papa, tomate y pimiento'
  if (g === 'cafe') return 'Café'
  if (g === 'cacao') return 'Cacao'
  if (g === 'maiz') return 'Maíz'
  return CULTIVOS[grupo]?.nombre ?? grupo
}

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
const RUTA_METADATOS = CARPETA_MODELOS + 'metadatos.json'

export interface ActualizacionModelo {
  grupoId: GrupoModeloId
  nombreVisible: string
  tamano_mb: number
  versionServidor: string
  versionLocal?: string
  sha256Servidor: string
  sha256Local?: string
  archivo: string
}

export type MetadatosModeloLocal = {
  version: string
  sha256: string
  tamano_bytes?: number
  actualizado_en?: string
}

export type MapaMetadatosModelos = Record<string, MetadatosModeloLocal>

let cacheMetadatos: MapaMetadatosModelos | null = null

type LimpiadorSesion = (nombre?: string) => void
let limpiadorSesionFn: LimpiadorSesion | null = null

export function registrarLimpiadorSesion(fn: LimpiadorSesion) {
  limpiadorSesionFn = fn
}

export function invalidarSesionModelo(nombre?: string) {
  try {
    limpiadorSesionFn?.(nombre)
  } catch {}
}

let infoModelosAssets: { modelos?: { nombre: string; version: string; sha256?: string }[] } | null = null
try {
  infoModelosAssets = require('../assets/modelos/modelos.json')
} catch {}

function versionManifestAsset(grupoId: string): string | null {
  try {
    const m = infoModelosAssets?.modelos?.find((x: any) => x.nombre === grupoId)
    return m?.version ?? null
  } catch {
    return null
  }
}

export async function leerMetadatosModelos(): Promise<MapaMetadatosModelos> {
  try {
    const info = await FileSystem.getInfoAsync(RUTA_METADATOS)
    if (info.exists) {
      const texto = await FileSystem.readAsStringAsync(RUTA_METADATOS)
      const obj = JSON.parse(texto)
      if (obj && typeof obj === 'object') {
        cacheMetadatos = obj
        return obj
      }
    }
  } catch {}
  cacheMetadatos = {}
  return {}
}

export async function guardarMetadatosModelo(
  grupoId: string,
  meta: { version: string; sha256: string; tamano_bytes?: number }
): Promise<void> {
  try {
    await asegurarDirectorioModelos()
    const actuales = await leerMetadatosModelos()
    actuales[grupoId] = {
      ...meta,
      actualizado_en: new Date().toISOString(),
    }
    cacheMetadatos = actuales
    await FileSystem.writeAsStringAsync(RUTA_METADATOS, JSON.stringify(actuales, null, 2))
  } catch {}
}

export async function eliminarMetadatosModelo(grupoId: string): Promise<void> {
  try {
    const actuales = await leerMetadatosModelos()
    if (actuales[grupoId]) {
      delete actuales[grupoId]
      cacheMetadatos = actuales
      await FileSystem.writeAsStringAsync(RUTA_METADATOS, JSON.stringify(actuales, null, 2))
    }
  } catch {}
}

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

    // Guardar versión y sha256 en JSON de metadatos (con try)
    try {
      const v = versionManifestAsset(grupoId) ?? '1.0.0'
      const infoFinal = await FileSystem.getInfoAsync(resultado.uri)
      await guardarMetadatosModelo(grupoId, {
        version: v,
        sha256: grupo.sha256,
        tamano_bytes: infoFinal.exists ? infoFinal.size : 0,
      })
    } catch {}

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
  try {
    await eliminarMetadatosModelo(grupoId)
  } catch {}
  try {
    invalidarSesionModelo(grupoId)
  } catch {}
  notificarDescarga(grupoId, { progreso: 0, bytes: 0, total: 0, estado: 'inactiva' })
  notificarCambioModelos()
}

/**
 * Actualiza un modelo especialista descargándolo primero a un archivo temporal (.tmp),
 * verificando el hash sha256 y solo reemplazando el archivo anterior si es correcto.
 * Si falla, el archivo antiguo se preserva sin cambios.
 * Tras reemplazar, guarda metadatos e invalida la sesión ONNX en caché.
 */
export async function actualizarModelo(
  grupoId: GrupoModeloId,
  infoServidor?: Partial<ActualizacionModelo>
): Promise<boolean> {
  // 1. Validar que la app no requiera actualización previa (o sin internet)
  const v = await verificarParaDescargarModelos()
  if (!v.puedeDescargar) {
    if (v.requiereActualizacion) {
      throw new Error(`Primero debes actualizar FitoLens a la versión ${v.versionRequerida ?? ''} antes de actualizar el modelo.`)
    }
    if (v.sinInternet) {
      throw new Error('Sin internet no se pueden descargar actualizaciones de modelos.')
    }
  }

  const grupo = GRUPOS_MODELO.find((g) => g.id === grupoId)
  if (!grupo) throw new Error(`Cultivo no encontrado: ${nombreVisibleGrupo(grupoId)}`)

  await asegurarDirectorioModelos()

  // 2. Resolver info del servidor
  let versionServidor = infoServidor?.versionServidor
  let shaEsperado = infoServidor?.sha256Servidor ?? grupo.sha256
  let tamanoMb = infoServidor?.tamano_mb ?? grupo.tamano_mb
  const archivoNombre = infoServidor?.archivo ?? grupo.archivo

  if (!versionServidor) {
    try {
      const ctl = new AbortController()
      const t = setTimeout(() => { try { ctl.abort() } catch {} }, 6000)
      const res = await fetch(`${API}/descargas/modelos/modelos.json?t=${Date.now()}`, {
        signal: ctl.signal,
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (res.ok) {
        const d = await res.json()
        const m = d?.modelos?.find((x: any) => x.nombre === grupoId || x.archivo === archivoNombre)
        if (m) {
          versionServidor = m.version
          shaEsperado = m.sha256 ?? shaEsperado
          tamanoMb = m.tamano_mb ?? tamanoMb
        }
      }
      clearTimeout(t)
    } catch {}
  }

  const urlRemota = `${API}/descargas/modelos/${archivoNombre}`
  const rutaDestino = rutaArchivoModelo(archivoNombre)
  const rutaTemporal = rutaArchivoModelo(`${archivoNombre}.tmp_${Date.now()}`)
  const tamanoTotalBytes = Math.round(tamanoMb * 1024 * 1024)

  notificarDescarga(grupoId, {
    progreso: 0,
    bytes: 0,
    total: tamanoTotalBytes,
    estado: 'descargando',
  })

  const callback = (descarga: FileSystem.DownloadProgressData) => {
    const total = descarga.totalBytesExpectedToWrite > 0 ? descarga.totalBytesExpectedToWrite : tamanoTotalBytes
    const progreso = total > 0 ? Math.min(1, descarga.totalBytesWritten / total) : 0
    notificarDescarga(grupoId, {
      progreso,
      bytes: descarga.totalBytesWritten,
      total,
      estado: 'descargando',
    })
  }

  let resumable: FileSystem.DownloadResumable | null = null
  try {
    try { await FileSystem.deleteAsync(rutaTemporal, { idempotent: true }) } catch {}

    resumable = FileSystem.createDownloadResumable(urlRemota, rutaTemporal, {}, callback)
    descargasActivas[grupoId] = resumable

    const resultado = await resumable.downloadAsync()
    delete descargasActivas[grupoId]

    if (!resultado?.uri) {
      throw new Error('Descarga no completada')
    }

    // Verificación de integridad en el archivo temporal
    const shaOk = await verificarSha256(resultado.uri, shaEsperado)
    if (!shaOk) {
      // Si falla, el archivo viejo sigue intacto en rutaDestino
      try { await FileSystem.deleteAsync(resultado.uri, { idempotent: true }) } catch {}
      throw new Error(`La verificación del modelo de ${nombreVisibleGrupo(grupoId)} no coincidió. Vuelve a intentarlo.`)
    }

    // Solo si el sha coincide se reemplaza el archivo viejo
    try { await FileSystem.deleteAsync(rutaDestino, { idempotent: true }) } catch {}
    await FileSystem.moveAsync({ from: resultado.uri, to: rutaDestino })

    // Guardar versión y sha256 en JSON de metadatos (con try)
    try {
      const infoFinal = await FileSystem.getInfoAsync(rutaDestino)
      await guardarMetadatosModelo(grupoId, {
        version: versionServidor ?? '1.0.0',
        sha256: shaEsperado,
        tamano_bytes: infoFinal.exists ? infoFinal.size : 0,
      })
    } catch {}

    // Invalidar la sesión ONNX en caché de ese modelo (en ia.ts y modelos.ts)
    try {
      invalidarSesionModelo(grupoId)
    } catch {}

    notificarDescarga(grupoId, {
      progreso: 1,
      bytes: tamanoTotalBytes,
      total: tamanoTotalBytes,
      estado: 'listo',
    })
    notificarCambioModelos()
    return true
  } catch (e: any) {
    delete descargasActivas[grupoId]
    try { await FileSystem.deleteAsync(rutaTemporal, { idempotent: true }) } catch {}
    const err = e?.message ?? `Error al actualizar modelo de ${nombreVisibleGrupo(grupoId)}`
    notificarDescarga(grupoId, { progreso: 0, bytes: 0, total: 0, estado: 'error', error: err })
    throw e
  }
}

/**
 * Lee el índice de modelos del servidor (con timeout, sin romper sin internet)
 * y devuelve los grupos instalados cuya versión o sha256 difiere de la local.
 * Para modelos ya descargados sin metadatos, compara el tamaño en bytes del archivo
 * con el tamaño del servidor (o sha256) para decidir.
 */
export async function revisarActualizacionesModelos(): Promise<ActualizacionModelo[]> {
  try {
    const online = await enLinea().catch(() => false)
    if (!online) return []

    const ctl = new AbortController()
    const t = setTimeout(() => {
      try { ctl.abort() } catch {}
    }, 6000)

    let data: any = null
    try {
      const res = await fetch(`${API}/descargas/modelos/modelos.json?t=${Date.now()}`, {
        signal: ctl.signal,
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!res.ok) return []
      data = await res.json()
    } catch {
      return []
    } finally {
      clearTimeout(t)
    }

    if (!data || !Array.isArray(data.modelos)) return []

    const metadatosLocales = await leerMetadatosModelos()
    const actualizaciones: ActualizacionModelo[] = []

    for (const g of GRUPOS_MODELO) {
      try {
        const instalado = await estaGrupoDisponible(g.id)
        if (!instalado) continue

        const modeloServidor = data.modelos.find((m: any) => m.nombre === g.id || m.archivo === g.archivo)
        if (!modeloServidor) continue

        const metaLocal = metadatosLocales[g.id]
        const rutaDescargada = await rutaLocalDescargada(g.id)

        let hayNueva = false
        let versionLocal: string | undefined = undefined

        if (metaLocal) {
          versionLocal = metaLocal.version
          const difiereVersion = Boolean(modeloServidor.version && metaLocal.version && modeloServidor.version !== metaLocal.version)
          const difiereSha = Boolean(modeloServidor.sha256 && metaLocal.sha256 && modeloServidor.sha256.toLowerCase() !== metaLocal.sha256.toLowerCase())
          if (difiereVersion || difiereSha) {
            hayNueva = true
          }
        } else if (rutaDescargada) {
          // Modelos ya descargados sin metadatos: compara el tamaño en bytes del archivo con tamaño del servidor o sha256
          try {
            const info = await FileSystem.getInfoAsync(rutaDescargada)
            if (info.exists && typeof info.size === 'number') {
              const tamanoLocalBytes = info.size
              if (typeof modeloServidor.tamano_bytes === 'number') {
                if (Math.abs(tamanoLocalBytes - modeloServidor.tamano_bytes) > 512) {
                  hayNueva = true
                }
              } else if (typeof modeloServidor.tamano_mb === 'number') {
                const mbLocal = tamanoLocalBytes / (1024 * 1024)
                if (Math.abs(mbLocal - modeloServidor.tamano_mb) > 0.1) {
                  hayNueva = true
                }
              }

              if (modeloServidor.sha256 && g.sha256 && modeloServidor.sha256.toLowerCase() !== g.sha256.toLowerCase()) {
                hayNueva = true
              }
              const verAsset = versionManifestAsset(g.id)
              if (modeloServidor.version && verAsset && modeloServidor.version !== verAsset) {
                hayNueva = true
              }

              if (!hayNueva) {
                // Modelo ya descargado y al día: guardar metadatos para optimizar siguientes comprobaciones
                await guardarMetadatosModelo(g.id, {
                  version: modeloServidor.version ?? verAsset ?? '1.0.0',
                  sha256: modeloServidor.sha256 ?? g.sha256,
                  tamano_bytes: tamanoLocalBytes,
                })
              }
            }
          } catch {}
        } else if (estaIncluidoEnApk(g.id)) {
          const verAsset = versionManifestAsset(g.id)
          versionLocal = verAsset ?? undefined
          const shaAsset = g.sha256
          const difiereVersion = Boolean(modeloServidor.version && verAsset && modeloServidor.version !== verAsset)
          const difiereSha = Boolean(modeloServidor.sha256 && shaAsset && modeloServidor.sha256.toLowerCase() !== shaAsset.toLowerCase())
          if (difiereVersion || difiereSha) {
            hayNueva = true
          }
        }

        if (hayNueva) {
          actualizaciones.push({
            grupoId: g.id,
            nombreVisible: nombreVisibleGrupo(g.id),
            tamano_mb: modeloServidor.tamano_mb ?? g.tamano_mb,
            versionServidor: modeloServidor.version ?? 'nueva',
            versionLocal,
            sha256Servidor: modeloServidor.sha256 ?? g.sha256,
            sha256Local: metaLocal?.sha256,
            archivo: modeloServidor.archivo ?? g.archivo,
          })
        }
      } catch {}
    }

    return actualizaciones
  } catch {
    return []
  }
}

/**
 * Hook para consultar y vigilar actualizaciones disponibles de los modelos instalados.
 */
export function useActualizacionesModelos() {
  const [actualizaciones, setActualizaciones] = useState<ActualizacionModelo[]>([])
  const [comprobando, setComprobando] = useState(false)

  const refrescarActualizaciones = useCallback(async () => {
    setComprobando(true)
    try {
      const lista = await revisarActualizacionesModelos()
      setActualizaciones(lista)
    } catch {
      setActualizaciones([])
    } finally {
      setComprobando(false)
    }
  }, [])

  useEffect(() => {
    refrescarActualizaciones()
    const quitarCambio = alCambiarModelos(refrescarActualizaciones)
    return () => {
      quitarCambio()
    }
  }, [refrescarActualizaciones])

  const tieneActualizacion = useCallback(
    (grupoId: GrupoModeloId): ActualizacionModelo | null => {
      return actualizaciones.find((a) => a.grupoId === grupoId) ?? null
    },
    [actualizaciones]
  )

  return {
    actualizaciones,
    comprobando,
    refrescarActualizaciones,
    tieneActualizacion,
    totalActualizaciones: actualizaciones.length,
  }
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

  // Lista de identificadores de cultivos instalados en orden: Limón, Naranja, Papa, Tomate, Pimiento, Café, Cacao, Maíz
  const cultivosInstalados = ORDEN_PLANTAS.filter((cId) => {
    const grupo = CULTIVO_A_GRUPO[cId]
    return grupo ? gruposInstaladosIds.includes(grupo) : false
  })

  // Lista de identificadores de cultivos disponibles para descargar
  const cultivosDisponibles = ORDEN_PLANTAS.filter((cId) => !cultivosInstalados.includes(cId))

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
