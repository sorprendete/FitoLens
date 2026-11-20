// Cliente de la API de FitoLens (contrato en PLAN.md §6).
// Si la API no responde y MODO_DEMO no es 'false', se usan datos de ejemplo (mocks.js)
// y la interfaz lo indica con la etiqueta "Modo demostración".
import { API_URL, MODO_DEMO, TIEMPO_ESPERA } from '../config'
import * as mocks from './mocks'

let enDemo = MODO_DEMO === 'true'
const oyentes = new Set()
export const esDemo = () => enDemo
export function alCambiarDemo(fn) { oyentes.add(fn); return () => oyentes.delete(fn) }
function marcarDemo(v) { if (enDemo !== v) { enDemo = v; oyentes.forEach((fn) => fn(v)) } }

async function pedir(ruta, opciones = {}) {
  const control = new AbortController()
  const t = setTimeout(() => control.abort(), TIEMPO_ESPERA)
  try {
    const r = await fetch(API_URL + ruta, { ...opciones, signal: control.signal })
    if (!r.ok) {
      const cuerpo = await r.json().catch(() => ({}))
      const e = new Error(cuerpo.detail || cuerpo.mensaje || `Error ${r.status}`)
      e.estado = r.status
      throw e
    }
    return await r.json()
  } finally { clearTimeout(t) }
}

// Ejecuta la llamada real; si falla por red (no por un error de la API) cae al mock.
async function conRespaldo(real, demo) {
  if (enDemo) return demo()
  try {
    const datos = await real()
    marcarDemo(false)
    return datos
  } catch (e) {
    // 502/504 = el proxy no encontró la API (caída o reiniciando): se trata como sin conexión.
    if (MODO_DEMO === 'false' || (e.estado && e.estado !== 502 && e.estado !== 504)) throw e
    marcarDemo(true)
    return demo()
  }
}

export function diagnosticar(imagen, provincia) {
  return conRespaldo(() => {
    const f = new FormData()
    f.append('imagen', imagen, 'foto.jpg')
    if (provincia) f.append('provincia', provincia)
    return pedir('/diagnostico', { method: 'POST', body: f })
  }, () => mocks.diagnostico(imagen, provincia))
}

export const obtenerBrotes = (desde) =>
  conRespaldo(() => pedir(`/brotes?desde=${desde}`), () => mocks.brotes(desde))

export const obtenerMetricas = () => conRespaldo(() => pedir('/metricas'), mocks.metricas)
