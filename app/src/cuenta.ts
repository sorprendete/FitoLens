// Cuenta opcional: vincula este teléfono a una cuenta de la web para que sus diagnósticos aparezcan allá.
// Sin cuenta la app funciona igual. El token se guarda cifrado (expo-secure-store) y dura 90 días.
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { API } from './servidor'

export type Cuenta = { nombre: string; email: string; dispositivo: number; provincia: string | null }

export const PROVINCIAS: Record<string, string> = {
  bellavista: 'Bellavista', el_dorado: 'El Dorado', huallaga: 'Huallaga', lamas: 'Lamas',
  mariscal_caceres: 'Mariscal Cáceres', moyobamba: 'Moyobamba', picota: 'Picota', rioja: 'Rioja',
  san_martin: 'San Martín', tocache: 'Tocache',
}

const K_TOKEN = 'fitolens_token', K_CUENTA = 'fitolens_cuenta', K_PROVINCIA = 'fitolens_provincia'

let cuenta: Cuenta | null = null
let token: string | null = null
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())

export function alCambiar(f: () => void) { oyentes.add(f); return () => { oyentes.delete(f) } }
export const cuentaActual = () => cuenta
export const tokenActual = () => token

// Se llama una vez al abrir la app.
export async function cargarCuenta() {
  token = await SecureStore.getItemAsync(K_TOKEN)
  const c = await SecureStore.getItemAsync(K_CUENTA)
  const provincia = await SecureStore.getItemAsync(K_PROVINCIA)
  cuenta = token && c ? { ...JSON.parse(c), provincia } : null
  provinciaGuardada = provincia
  avisar()
}

// La provincia se usa también sin cuenta (va con cada diagnóstico al mapa de brotes).
let provinciaGuardada: string | null = null
export const provinciaActual = () => provinciaGuardada
export async function elegirProvincia(p: string | null) {
  provinciaGuardada = p
  if (p) await SecureStore.setItemAsync(K_PROVINCIA, p); else await SecureStore.deleteItemAsync(K_PROVINCIA)
  if (cuenta) cuenta = { ...cuenta, provincia: p }
  avisar()
}

export async function iniciarSesion(email: string, password: string) {
  const nombre_dispositivo = Platform.OS === 'ios' ? 'iPhone' : 'Teléfono Android'
  const res = await fetch(`${API}/api/dispositivos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password, nombre_dispositivo }),
  })
  const d = await res.json().catch(() => null)
  if (!res.ok) throw new Error(typeof d?.detail === 'string' ? d.detail : res.status === 422 ? 'Revisa el correo.' : `Error ${res.status}`)
  token = d.access_token as string
  const c = { nombre: d.usuario.nombre, email: d.usuario.email, dispositivo: d.dispositivo.id }
  await SecureStore.setItemAsync(K_TOKEN, token)
  await SecureStore.setItemAsync(K_CUENTA, JSON.stringify(c))
  cuenta = { ...c, provincia: provinciaGuardada }
  avisar()
}

// Desvincula el teléfono. Los diagnósticos ya subidos se quedan en la web; los pendientes se quedan en el teléfono.
export async function cerrarSesion() {
  if (token && cuenta) {
    const t = token, id = cuenta.dispositivo
    fetch(`${API}/api/dispositivos/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } }).catch(() => {})
  }
  await olvidarSesion()
}

// El servidor rechazó el token (vencido o desvinculado desde la web).
export async function olvidarSesion() {
  token = null; cuenta = null
  await SecureStore.deleteItemAsync(K_TOKEN)
  await SecureStore.deleteItemAsync(K_CUENTA)
  avisar()
}
