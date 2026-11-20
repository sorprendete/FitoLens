// Conexión opcional con el servidor FitoLens (solo cuando hay internet).
import Constants from 'expo-constants'
import * as Network from 'expo-network'
import type { Resultado } from './ia'

export const API = (Constants.expoConfig?.extra?.api as string) ?? 'https://fitolens.5-253-232-122.sslip.io'

export async function enLinea() {
  try { const e = await Network.getNetworkStateAsync(); return !!e.isConnected && e.isInternetReachable !== false } catch { return false }
}

// Envía la foto a POST /api/diagnostico: el servidor la registra (mapa de brotes) y devuelve su diagnóstico.
export async function enviar(uri: string): Promise<Resultado> {
  const f = new FormData()
  f.append('imagen', { uri, name: 'foto.jpg', type: 'image/jpeg' } as any)
  f.append('origen', 'app')
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000)
  try {
    const res = await fetch(`${API}/api/diagnostico`, { method: 'POST', body: f, signal: ctl.signal })
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Error ${res.status}`)
    const d = await res.json()
    return { estado: d.estado, cultivo: d.cultivo, clase: d.clase, etiqueta: d.etiqueta, confianza: d.confianza, top3: d.top3 ?? [],
      motivo: d.motivo, ms: d.duracion_ms, version: d.modelo_version, origen: 'servidor' }
  } finally { clearTimeout(t) }
}
