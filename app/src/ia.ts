// Diagnóstico sin internet: router (¿qué cultivo?) → especialista del cultivo. Misma lógica que api/app/ia/pipeline.py.
import { Asset } from 'expo-asset'
import { NombreModelo, archivo, manifest } from './modelos'
import { aTensor } from './imagen'

export type Resultado = {
  estado: 'diagnostico' | 'no_concluyente' | 'rechazada'
  cultivo: string | null; clase: string | null; etiqueta: string | null; confianza: number | null
  top3: { clase: string; etiqueta: string; confianza: number }[]
  motivo: string | null; ms: number; version: string; origen: 'telefono' | 'servidor'
}

type Clase = { id: string; etiqueta?: string; nombre?: string; cultivo?: string | null }
type Manifest = {
  version: string; clases: Clase[]; entrada: { alto: number; ancho: number }
  temperatura?: number; umbral?: number; rechazo?: string[]; especialistas?: Record<string, string>
}

const MOTIVOS = {
  no_planta: 'La foto no parece una planta. Toma la foto de cerca a una hoja o mazorca, con buena luz.',
  otra_planta: 'Parece otra planta. FitoLens diagnostica pimiento, papa, tomate, café y cacao.',
  router_duda: 'No se pudo reconocer el cultivo con seguridad. Prueba con una foto más cercana y nítida.',
  sin_especialista: 'Todavía no hay un modelo instalado para este cultivo.',
  especialista_duda: 'El modelo no está seguro. Puede ser un problema que no conoce o una foto poco clara. No se emite diagnóstico para evitar un error.',
}
const ESPECIALISTAS = { pimiento: 'hortalizas', papa: 'hortalizas', tomate: 'hortalizas', cafe: 'cafe', cacao: 'cacao' }

// onnxruntime es nativo: no existe en Expo Go. Ahí la app diagnostica con el servidor.
let ort: typeof import('onnxruntime-react-native') | null = null
try { ort = require('onnxruntime-react-native'); if (!ort?.InferenceSession) ort = null } catch { ort = null }
export const hayIaLocal = () => ort !== null

const sesiones: Partial<Record<NombreModelo, any>> = {}
async function sesion(nombre: NombreModelo) {
  if (!sesiones[nombre]) {
    const [a] = await Asset.loadAsync(archivo(nombre))
    sesiones[nombre] = await ort!.InferenceSession.create((a.localUri ?? a.uri).replace('file://', ''))
  }
  return sesiones[nombre]
}

async function logits(nombre: NombreModelo, uri: string): Promise<number[]> {
  const m: Manifest = manifest(nombre)
  const { alto, ancho } = m.entrada
  const s = await sesion(nombre)
  const salida = await s.run({ imagen: new ort!.Tensor('float32', await aTensor(uri, alto, ancho), [1, 3, alto, ancho]) }, ['logits'])
  return Array.from(salida.logits.data as Float32Array)
}

const softmax = (x: number[], t = 1) => {
  const z = x.map((v) => v / t), mx = Math.max(...z), e = z.map((v) => Math.exp(v - mx)), s = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / s)
}
const etiqueta = (c: Clase) => c.etiqueta ?? c.nombre ?? c.id

export async function diagnosticarLocal(uri: string): Promise<Resultado> {
  const t0 = Date.now()
  const mr: Manifest = manifest('router')
  const r: Resultado = { estado: 'rechazada', cultivo: null, clase: null, etiqueta: null, confianza: null, top3: [], motivo: null, ms: 0, version: mr.version, origen: 'telefono' }
  const fin = () => ((r.ms = Date.now() - t0), r)

  // 1. Router: ¿qué cultivo es?
  const pr = softmax(await logits('router', uri), mr.temperatura ?? 1)
  const i = pr.indexOf(Math.max(...pr)), cultivo = mr.clases[i].id
  if ((mr.rechazo ?? ['otra_planta', 'no_planta']).includes(cultivo)) return (r.motivo = MOTIVOS[cultivo as 'no_planta'] ?? MOTIVOS.otra_planta), fin()
  if (pr[i] < (mr.umbral ?? 0.6)) return (r.estado = 'no_concluyente'), (r.motivo = MOTIVOS.router_duda), fin()
  r.cultivo = cultivo

  // 2. Especialista: solo las clases del cultivo elegido, renormalizadas.
  const nombre = ((mr.especialistas ?? ESPECIALISTAS) as Record<string, string>)[cultivo] as NombreModelo
  const me: Manifest | null = manifest(nombre)
  if (!me) return (r.estado = 'no_concluyente'), (r.motivo = MOTIVOS.sin_especialista), fin()
  const l = await logits(nombre, uri)
  const idx = me.clases.map((c, k) => (c.cultivo ?? c.id.split('_')[0]) === cultivo ? k : -1).filter((k) => k >= 0)
  const p = softmax(idx.map((k) => l[k]), me.temperatura ?? 1)
  const orden = p.map((v, j) => [v, idx[j]] as const).sort((a, b) => b[0] - a[0])
  r.top3 = orden.slice(0, 3).map(([v, k]) => ({ clase: me.clases[k].id, etiqueta: etiqueta(me.clases[k]), confianza: v }))
  const [conf, k] = orden[0]
  r.confianza = conf
  r.version = `${mr.version} + ${nombre} ${me.version}`
  if (conf < (me.umbral ?? 0.6)) return (r.estado = 'no_concluyente'), (r.motivo = MOTIVOS.especialista_duda), fin()
  r.estado = 'diagnostico'; r.clase = me.clases[k].id; r.etiqueta = etiqueta(me.clases[k])
  return fin()
}
