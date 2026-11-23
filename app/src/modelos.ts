// Catálogo y resolución de archivos .onnx (incluidos en APK o descargados en documentDirectory/modelos/).
import { MODELOS_INCLUIDOS } from './modelosIncluidos'
import { estaGrupoDisponible, estaVerificadorDisponible, rutaLocalDescargada } from './gestorModelos'

const INFO: { modelos: any[] } = require('../assets/modelos/modelos.json')

export type NombreModelo = 'router' | 'hortalizas' | 'cafe' | 'cacao' | 'maiz' | 'citricos' | 'verificador'

export type FuenteModelo =
  | { tipo: 'asset'; recurso: number }
  | { tipo: 'archivo'; ruta: string }

/**
 * Devuelve el recurso bundled si está en el APK (para compatibilidad).
 */
export const archivo = (n: string): number | null => {
  return MODELOS_INCLUIDOS[n] ?? null
}

/**
 * Busca primero si el archivo descargado o actualizado existe en documentDirectory/modelos/,
 * y si no, busca el recurso que viaja dentro del APK (asset require).
 */
export async function obtenerFuenteModelo(n: string): Promise<FuenteModelo | null> {
  const ruta = await rutaLocalDescargada(n)
  if (ruta) {
    return { tipo: 'archivo', ruta }
  }
  if (MODELOS_INCLUIDOS[n]) {
    return { tipo: 'asset', recurso: MODELOS_INCLUIDOS[n] }
  }
  return null
}

/**
 * Comprueba si el modelo está listo para inferir sin internet.
 */
export async function estaModeloInstalado(n: string): Promise<boolean> {
  if (n === 'verificador') {
    return estaVerificadorDisponible()
  }
  return estaGrupoDisponible(n)
}

// Un modelo que no figura en modelos.json no se usa.
export const manifest = (n: string) => INFO.modelos.find((m) => m.nombre === n) ?? null
