// Conexión opcional con el servidor FitoLens (solo cuando hay internet).
import Constants from 'expo-constants'
import * as Network from 'expo-network'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import type { Resultado } from './ia'
import { tokenActual } from './cuenta'

export const API = (Constants.expoConfig?.extra?.api as string) ?? 'https://fitolens.5-253-232-122.sslip.io'

export async function enLinea() {
  try { const e = await Network.getNetworkStateAsync(); return !!e.isConnected && e.isInternetReachable !== false } catch { return false }
}

// Con cuenta, cada petición lleva el token del teléfono.
const cabecera = (): Record<string, string> => { const t = tokenActual(); return t ? { Authorization: `Bearer ${t}` } : {} }

// Error del servidor con su código, para decidir si reintentar más tarde.
export class ErrorServidor extends Error { constructor(public codigo: number, mensaje: string) { super(mensaje) } }

async function pedir(ruta: string, cuerpo: FormData, ms = 20000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(`${API}${ruta}`, { method: 'POST', body: cuerpo, headers: cabecera(), signal: ctl.signal })
    const d = await res.json().catch(() => null)
    if (!res.ok) throw new ErrorServidor(res.status, typeof d?.detail === 'string' ? d.detail : `Error ${res.status}`)
    return d
  } finally { clearTimeout(t) }
}

// Envía la foto a POST /api/diagnostico: el servidor la registra (mapa de brotes) y devuelve su diagnóstico.
export async function enviar(uri: string, provincia?: string | null): Promise<Resultado> {
  const f = new FormData()
  f.append('imagen', { uri, name: 'foto.jpg', type: 'image/jpeg' } as any)
  f.append('origen', 'app')
  if (provincia) f.append('provincia', provincia)
  const d = await pedir('/api/diagnostico', f)
  return { estado: d.estado, cultivo: d.cultivo, clase: d.clase, etiqueta: d.etiqueta, confianza: d.confianza, top3: d.top3 ?? [],
    motivo: d.motivo, ms: d.duracion_ms, version: d.modelo_version, origen: 'servidor' }
}

// Foto más liviana para subir con señal débil en el campo (lado mayor 1600 px).
async function reducir(uri: string) {
  try {
    const img = await ImageManipulator.manipulate(uri).resize({ width: 1600 }).renderAsync()
    return (await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })).uri
  } catch { return uri }
}

export type Pendiente = { id_cliente: string; foto: string; fecha: string; provincia: string | null; r: Resultado }

// Sube a POST /api/sincronizar un diagnóstico hecho sin internet, con el resultado que vio el agricultor.
// Reenviar el mismo id_cliente no lo duplica en el servidor.
export async function subir(p: Pendiente): Promise<number> {
  const f = new FormData()
  f.append('imagen', { uri: await reducir(p.foto), name: 'foto.jpg', type: 'image/jpeg' } as any)
  f.append('id_cliente', p.id_cliente)
  f.append('estado', p.r.estado)
  f.append('fecha', p.fecha)
  f.append('modelo_version', (p.r.version ?? '').slice(0, 120))
  f.append('duracion_ms', String(p.r.ms ?? 0))
  if (p.r.cultivo) f.append('cultivo', p.r.cultivo)
  if (p.r.clase) f.append('clase', p.r.clase)
  if (p.r.confianza != null) f.append('confianza', String(p.r.confianza))
  if (p.provincia) f.append('provincia', p.provincia)
  return (await pedir('/api/sincronizar', f, 60000)).id
}
