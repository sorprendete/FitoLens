// Cliente de la API de FitoLens. Única puerta de la web hacia el servidor.
// - Datos públicos (diagnóstico, brotes, métricas): si la API no responde se usan mocks
//   y la interfaz muestra "Modo demostración".
// - Cuentas, historial y administración: NUNCA se simulan, salvo con VITE_MODO_DEMO=true.
import { API_URL, MODO_DEMO, TIEMPO_ESPERA } from '../config'
import { NOMBRES_MODELO, nombreModelo } from '../datos/modelos'
import * as mocks from './mocks'

const DEMO_FORZADO = MODO_DEMO === 'true'
let enDemo = DEMO_FORZADO
const oyentes = new Set()
export const esDemo = () => enDemo
export function alCambiarDemo(fn) { oyentes.add(fn); return () => oyentes.delete(fn) }
function marcarDemo(v) { if (enDemo !== v) { enDemo = v; oyentes.forEach((fn) => fn(v)) } }

// Token de sesión (lo fija contexto/Sesion.jsx). Si la API responde 401, se avisa para cerrar sesión.
let token = null
let alExpirar = () => {}
export function fijarToken(t, fnExpira) { token = t; if (fnExpira) alExpirar = fnExpira }

async function pedir(ruta, { metodo = 'GET', cuerpo, json } = {}) {
  const control = new AbortController()
  const t = setTimeout(() => control.abort(), TIEMPO_ESPERA)
  const cabeceras = {}
  if (token) cabeceras.Authorization = `Bearer ${token}`
  if (json !== undefined) cabeceras['Content-Type'] = 'application/json'
  try {
    const r = await fetch(API_URL + ruta, {
      method: metodo, headers: cabeceras, signal: control.signal,
      body: json !== undefined ? JSON.stringify(json) : cuerpo,
    })
    if (!r.ok) {
      const c = await r.json().catch(() => ({}))
      const detalle = Array.isArray(c.detail) ? 'Revisa los datos ingresados.' : c.detail
      const e = new Error(detalle || MENSAJES[r.status] || `Error ${r.status}`)
      e.estado = r.status
      if (r.status === 401 && token) alExpirar()
      throw e
    }
    return r.status === 204 ? null : await r.json()
  } catch (e) {
    if (e.name === 'AbortError') throw Object.assign(new Error('El servidor tardó demasiado en responder.'), { red: true })
    if (e instanceof TypeError) throw Object.assign(new Error('No se pudo conectar con el servidor.'), { red: true })
    throw e
  } finally { clearTimeout(t) }
}

const MENSAJES = {
  403: 'No tienes permiso para esta acción.', 413: 'La foto es demasiado grande.',
  415: 'Ese archivo no es una imagen válida.', 429: 'Demasiados intentos. Espera unos minutos.',
  502: 'El servidor no está disponible.', 503: 'El servicio se está iniciando. Intenta en un momento.',
}

// 502/504 = el proxy no encontró la API: se trata igual que sin conexión.
const sinServidor = (e) => e.red || e.estado === 502 || e.estado === 504

async function publico(real, demo) {
  if (enDemo) return demo()
  try { const d = await real(); marcarDemo(false); return d }
  catch (e) {
    if (MODO_DEMO === 'false' || !sinServidor(e)) throw e
    marcarDemo(true); return demo()
  }
}
const privado = (real, demo) => (DEMO_FORZADO ? demo() : real())

// --- Públicos ---
export function diagnosticar(imagen, provincia) {
  return publico(() => {
    const f = new FormData()
    f.append('imagen', imagen, 'foto.jpg')
    if (provincia) f.append('provincia', provincia)
    return pedir('/diagnostico', { metodo: 'POST', cuerpo: f })
  }, () => mocks.diagnostico(imagen, provincia))
}
export const obtenerBrotes = (desde) => publico(() => pedir(`/brotes?desde=${desde}`), () => mocks.brotes(desde))
// Versión de los modelos activos, desde /api/salud. Devuelve un texto como "Café v1.2 · Cacao v1.0".
export async function versionModelos() {
  const s = await publico(() => pedir('/salud'), async () => ({ modelo_version: 'demo' }))
  if (s.version_modelo || s.modelo_version) {
    let txt = s.version_modelo || s.modelo_version
    if (txt !== 'demo') {
      for (const [k, v] of Object.entries(NOMBRES_MODELO)) {
        txt = txt.replace(new RegExp(`\\b${k}\\b`, 'gi'), v)
      }
      return txt
    }
  }
  return Object.entries(s.modelos ?? {}).map(([n, v]) => `${nombreModelo(n)} v${String(v).replace(/^v/, '')}`).join(' · ')
}

export const obtenerMetricas = () => publico(() => pedir('/metricas'), mocks.metricas)

// --- Cuenta ---
export const iniciarSesion = (email, password) =>
  privado(() => pedir('/auth/login', { metodo: 'POST', json: { email, password } }), () => mocks.login(email))
export const iniciarSesionGoogle = (id_token) =>
  privado(() => pedir('/auth/google', { metodo: 'POST', json: { id_token } }), () => mocks.login('google@fitolens.pe', 'Usuario Google'))
export const registrarse = (nombre, email, password) =>
  privado(() => pedir('/auth/registro', { metodo: 'POST', json: { nombre, email, password } }), () => mocks.login(email, nombre))
export const yo = () => privado(() => pedir('/auth/yo'), mocks.yo)
export const actualizarPerfil = (nombre) =>
  privado(() => pedir('/auth/yo', { metodo: 'PATCH', json: { nombre } }), async () => {
    const u = await mocks.yo()
    u.nombre = nombre
    return u
  })
export const cambiarClave = (actual, nueva) =>
  privado(() => pedir('/auth/cambiar-clave', { metodo: 'POST', json: { actual, nueva } }), async () => ({ ok: true, mensaje: 'Contraseña actualizada.' }))
export function obtenerHistorial(limite = 200, opciones = {}) {
  let sin_parcela = false
  if (typeof limite === 'object' && limite !== null) {
    sin_parcela = Boolean(limite.sin_parcela)
    limite = limite.limite ?? 200
  } else if (typeof opciones === 'object' && opciones !== null) {
    sin_parcela = Boolean(opciones.sin_parcela)
  }
  const params = new URLSearchParams({ limite: String(limite) })
  if (sin_parcela) params.set('sin_parcela', 'true')
  return privado(() => pedir(`/historial?${params}`), () => mocks.historial({ limite, sin_parcela }))
}
export const borrarDiagnostico = (id) =>
  privado(() => pedir(`/historial/${id}`, { metodo: 'DELETE' }), () => mocks.borrarDiagnostico?.(id))

// --- Administración (rol admin) ---
export const admin = {
  resumen: () => privado(() => pedir('/admin/resumen'), mocks.resumen),
  usuarios: () => privado(() => pedir('/admin/usuarios'), mocks.usuarios),
  cambiarEstado: (id, activo) => privado(() => pedir(`/admin/usuarios/${id}/estado`, { metodo: 'POST', json: { activo } }), () => ({ id, activo })),
  auditoria: (q = {}) => {
    const p = new URLSearchParams(Object.entries({ limite: 200, ...q }).filter(([, v]) => v !== '' && v != null))
    return privado(() => pedir(`/admin/auditoria?${p}`), () => mocks.auditoria(q))
  },
  amenazas: (dias, simulado) => privado(() => pedir(`/admin/amenazas?dias=${dias}&simulado=${simulado}`), () => mocks.amenazas(dias)),
}

// --- Parcelas (seguimiento del tratamiento; requiere cuenta) ---
import * as mp from './mocksParcelas'
export const parcelas = {
  listar: () => privado(() => pedir('/parcelas'), mp.listar),
  detalle: (id) => privado(() => pedir(`/parcelas/${id}`), () => mp.detalle(id)),
  crear: (d) => privado(() => pedir('/parcelas', { metodo: 'POST', json: d }), () => mp.crear(d)),
  borrar: (id) => privado(() => pedir(`/parcelas/${id}`, { metodo: 'DELETE' }), () => mp.borrar(id)),
  visita: (id, d) => privado(() => pedir(`/parcelas/${id}/visitas`, { metodo: 'POST', json: d }), () => mp.visita(id, d)),
  borrarVisita: (id, vid) => privado(() => pedir(`/parcelas/${id}/visitas/${vid}`, { metodo: 'DELETE' }), () => mp.borrarVisita(id, vid)),
  agregarDiagnostico: (id, d) => privado(() => pedir(`/parcelas/${id}/diagnosticos`, { metodo: 'POST', json: d }), () => mp.agregarDiagnostico(id, d)),
  quitarDiagnostico: (id, diagId) => privado(() => pedir(`/parcelas/${id}/diagnosticos/${diagId}`, { metodo: 'DELETE' }), () => mp.quitarDiagnostico(id, diagId)),
}

// --- Teléfonos con la app vinculados a la cuenta ---
export const dispositivos = {
  listar: () => privado(() => pedir('/dispositivos'), async () => []),
  desvincular: (id) => privado(() => pedir(`/dispositivos/${id}`, { metodo: 'DELETE' }), async () => null),
}

// --- Reporte semanal para autoridades (rol admin) ---
export const reporteSemanal = (semanas, hasta) =>
  privado(() => pedir(`/reportes/semanal?semanas=${semanas}${hasta ? `&hasta=${hasta}` : ''}`), () => Promise.reject(new Error('El reporte necesita la API real.')))

// Descarga un archivo protegido por token (fetch + blob) y lo guarda con su nombre del servidor.
export async function descargar(ruta, nombre) {
  const r = await fetch(API_URL + ruta, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!r.ok) throw new Error(MENSAJES[r.status] || `Error ${r.status}`)
  const n = r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || nombre
  const url = URL.createObjectURL(await r.blob())
  Object.assign(document.createElement('a'), { href: url, download: n }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// --- Alertas de brote (públicas en el mapa; los suscriptores de Telegram, solo admin) ---
const alertasDemo = async () => ({ umbral: 3, ventana_dias: 7, alertas: [
  { id: 1, provincia: 'moyobamba', cultivo: 'cafe', clase: 'cafe_roya', casos: 6, ventana_dias: 7, avisados: 2, creado: new Date(Date.now() - 2 * 864e5).toISOString(), actualizada: new Date().toISOString() },
] })
export const alertas = {
  activas: () => publico(() => pedir('/alertas'), alertasDemo),
  suscripciones: () => privado(() => pedir('/alertas/suscripciones'), async () => []),
  suscribir: (d) => privado(() => pedir('/alertas/suscripciones', { metodo: 'POST', json: d }), async () => ({ id: Date.now(), ...d, provincia_nombre: d.provincia || 'Todas', creado: new Date().toISOString() })),
  borrar: (id) => privado(() => pedir(`/alertas/suscripciones/${id}`, { metodo: 'DELETE' }), async () => null),
}
