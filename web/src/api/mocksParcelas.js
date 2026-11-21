// Parcelas de demostración (solo con VITE_MODO_DEMO=true). Se guardan en memoria mientras la página esté abierta.
import { asignarParcelaMock, quitarParcelaMock } from './mocks'
const dia = (n) => new Date(Date.now() - n * 864e5).toISOString()
let sig = 10
const lista = [
  { id: 1, nombre: 'Cafetal La Loma', cultivo: 'cafe', provincia: 'moyobamba', latitud: null, longitud: null, creado: dia(40),
    historial: [
      { id: 1, fecha: dia(35), severidad: 3, tratamiento: 'Fungicida cúprico y poda de sombra', nota: null, diagnostico_id: null, clase: 'cafe_roya', confianza: 0.91, estado: 'diagnostico' },
      { id: 2, fecha: dia(25), severidad: 2, tratamiento: null, nota: 'Menos hojas con polvo amarillo', diagnostico_id: null, clase: 'cafe_roya', confianza: 0.84, estado: 'diagnostico' },
      { id: 3, fecha: dia(14), severidad: 1, tratamiento: 'Segunda aplicación', nota: null, diagnostico_id: null, clase: 'cafe_roya', confianza: 0.77, estado: 'diagnostico' },
      { id: 4, fecha: dia(3), severidad: 0, tratamiento: null, nota: 'Brotes nuevos sanos', diagnostico_id: null, clase: 'cafe_sana', confianza: 0.93, estado: 'diagnostico' },
    ] },
]

function tendencia(h) {
  if (h.length < 2) return 'sin_datos'
  const base = h.find((v) => v.tratamiento) ?? h[0]
  if (base === h[h.length - 1]) return 'sin_datos'
  const d = h[h.length - 1].severidad - base.severidad
  return d < 0 ? 'mejora' : d > 0 ? 'empeora' : 'igual'
}
const resumen = ({ historial: h, ...p }) => ({ ...p, visitas: h.length, tendencia: tendencia(h),
  severidad_actual: h.at(-1)?.severidad ?? null, ultima_visita: h.at(-1)?.fecha ?? null })
const buscar = (id) => lista.find((p) => p.id === Number(id))

export const listar = async () => ({ items: lista.map(resumen) })
export const detalle = async (id) => { const p = buscar(id); return { ...resumen(p), historial: p.historial } }
export async function crear(d) { const p = { id: ++sig, creado: dia(0), latitud: null, longitud: null, ...d, historial: [] }; lista.unshift(p); return resumen(p) }
export async function borrar(id) { lista.splice(lista.indexOf(buscar(id)), 1); return null }
export async function visita(id, d) {
  const v = { id: ++sig, fecha: dia(0), nota: null, tratamiento: null, clase: null, confianza: null, estado: null, diagnostico_id: null, ...d }
  if (v.severidad == null) v.severidad = 0
  buscar(id).historial.push(v); return v
}
export async function borrarVisita(id, vid) { const h = buscar(id).historial; h.splice(h.findIndex((v) => v.id === vid), 1); return null }
export async function agregarDiagnostico(id, d) {
  const p = buscar(id)
  if (!p) throw new Error('Parcela no encontrada')
  const v = { id: ++sig, fecha: dia(0), nota: d.nota || null, tratamiento: null, clase: d.clase || null, confianza: d.confianza || null, estado: d.estado || 'diagnostico', diagnostico_id: d.diagnostico_id, severidad: d.severidad ?? 2 }
  p.historial.push(v)
  if (d.diagnostico_id) asignarParcelaMock(d.diagnostico_id, p.id, p.nombre)
  return v
}
export async function quitarDiagnostico(id, diagId) {
  const p = buscar(id)
  if (!p) throw new Error('Parcela no encontrada')
  const idx = p.historial.findIndex((v) => v.diagnostico_id === Number(diagId))
  if (idx !== -1) p.historial.splice(idx, 1)
  quitarParcelaMock(diagId)
  return null
}
