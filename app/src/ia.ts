// Diagnóstico sin internet: router (¿qué cultivo?) → especialista del cultivo. Misma lógica que api/app/ia/pipeline.py.
// En paralelo, U2-Net-p ubica la hoja (solo para dibujar el contorno y recortar el mapa de calor: no cambia el diagnóstico).
import { Asset } from 'expo-asset'
import { manifest, obtenerFuenteModelo, estaModeloInstalado } from './modelos'
import { nombreVisibleGrupo, registrarLimpiadorSesion } from './gestorModelos'
import { aTensor } from './imagen'
import { ATENCION_MIN_DENTRO, LADO, Punto, Segmentacion, analizar, aptaPara, fraccionDentro, huecosMordedura, mapaCalor } from './vision'

export type Paso = { id: string; titulo: string; detalle: string; ms: number }
export type Resultado = {
  estado: 'diagnostico' | 'no_concluyente' | 'rechazada'
  cultivo: string | null; clase: string | null; etiqueta: string | null; confianza: number | null
  top3: { clase: string; etiqueta: string; confianza: number }[]
  motivo: string | null; ms: number; version: string; origen: 'telefono' | 'servidor'
  pasos?: Paso[]
  faltaModelo?: string
}
// "Visión de la IA": va aparte del resultado para no llenar el historial con imágenes.
export type Vision = { calor: string | null; contorno: Punto[][] }

type Clase = { id: string; etiqueta?: string; nombre?: string; cultivo?: string | null }
type Manifest = {
  version: string; clases: Clase[]; entrada: { alto: number; ancho: number }
  salidas?: { cam?: string; cam_tam?: [number, number] }
  temperatura?: number; umbral?: number; rechazo?: string[]; especialistas?: Record<string, string>
}

const MOTIVOS = {
  no_planta: 'La foto no parece una planta. Toma la foto de cerca a una hoja o mazorca, con buena luz.',
  otra_planta: 'Parece otra planta. FitoLens diagnostica pimiento, papa, tomate, café, cacao, maíz, limón y naranja.',
  router_duda: 'No se pudo reconocer el cultivo con seguridad. Prueba con una foto más cercana y nítida.',
  sin_especialista: 'Todavía no hay un modelo instalado para este cultivo.',
  especialista_duda: 'El modelo no está seguro. Puede ser un problema que no conoce o una foto poco clara. No se emite diagnóstico para evitar un error.',
}
const ESPECIALISTAS = { pimiento: 'hortalizas', papa: 'hortalizas', tomate: 'hortalizas', cafe: 'cafe', cacao: 'cacao', maiz: 'maiz', limon: 'citricos', naranja: 'citricos' }
export const NOMBRES_CULTIVO: Record<string, string> = { pimiento: 'pimiento', papa: 'papa', tomate: 'tomate', cafe: 'café', cacao: 'cacao', maiz: 'maíz', limon: 'limón', naranja: 'naranja' }
const pct = (v: number) => `${Math.round(v * 100)} %`

// onnxruntime es nativo: no existe en Expo Go. Ahí la app diagnostica con el servidor.
let ort: typeof import('onnxruntime-react-native') | null = null
try { ort = require('onnxruntime-react-native'); if (!ort?.InferenceSession) ort = null } catch { ort = null }
export const hayIaLocal = () => ort !== null

const SEGMENTADOR = require('../assets/recursos/u2netp_192.onnx')
const sesiones: Record<string, any> = {}

export function limpiarSesion(nombre?: string) {
  if (nombre) delete sesiones[nombre]
  else Object.keys(sesiones).forEach((k) => delete sesiones[k])
}

try {
  registrarLimpiadorSesion(limpiarSesion)
} catch {}

async function sesion(nombre: string) {
  if (!sesiones[nombre]) {
    if (nombre === 'segmentador') {
      const [a] = await Asset.loadAsync(SEGMENTADOR)
      sesiones[nombre] = await ort!.InferenceSession.create((a.localUri ?? a.uri).replace('file://', ''))
    } else {
      const fuente = await obtenerFuenteModelo(nombre)
      if (!fuente) throw new Error(`El modelo ${nombre} no está instalado.`)
      if (fuente.tipo === 'asset') {
        const [a] = await Asset.loadAsync(fuente.recurso)
        sesiones[nombre] = await ort!.InferenceSession.create((a.localUri ?? a.uri).replace('file://', ''))
      } else {
        const limpia = fuente.ruta.replace('file://', '')
        sesiones[nombre] = await ort!.InferenceSession.create(limpia)
      }
    }
  }
  return sesiones[nombre]
}

type Tensor = (alto: number, ancho: number) => Promise<Float32Array>
type Salida = { logits: number[]; cam: Float32Array | null; camTam: [number, number] }

async function predecir(nombre: string, tensor: Tensor): Promise<Salida> {
  const m: Manifest = manifest(nombre)
  const { alto, ancho } = m.entrada
  const s = await sesion(nombre)
  const entrada = { imagen: new ort!.Tensor('float32', await tensor(alto, ancho), [1, 3, alto, ancho]) }
  const nombreCam = m.salidas?.cam
  if (nombreCam && s.outputNames?.includes(nombreCam)) {
    try {
      const o = await s.run(entrada, ['logits', nombreCam])
      const dims = o[nombreCam].dims as number[]
      return { logits: Array.from(o.logits.data as Float32Array), cam: o[nombreCam].data as Float32Array, camTam: [dims[2], dims[3]] }
    } catch { /* sin mapa de calor, el diagnóstico sigue */ }
  }
  const o = await s.run(entrada, ['logits'])
  return { logits: Array.from(o.logits.data as Float32Array), cam: null, camTam: [0, 0] }
}

const MEDIA = [0.485, 0.456, 0.406], DESVIO = [0.229, 0.224, 0.225]
async function ubicarHoja(tensor: Tensor): Promise<Segmentacion | null> {
  try {
    const x = new Float32Array(await tensor(LADO, LADO)), n = LADO * LADO
    for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) x[c * n + i] = (x[c * n + i] - MEDIA[c]) / DESVIO[c]
    const s = await sesion('segmentador')
    const o = await s.run({ [s.inputNames[0]]: new ort!.Tensor('float32', x, [1, 3, LADO, LADO]) })
    const p = Float32Array.from(o[s.outputNames[0]].data as Float32Array, (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0))
    return analizar(p)
  } catch { return null } // nunca rompe un diagnóstico
}

const softmax = (x: number[], t = 1) => {
  const z = x.map((v) => v / t), mx = Math.max(...z), e = z.map((v) => Math.exp(v - mx)), s = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / s)
}
const etiqueta = (c: Clase) => c.etiqueta ?? c.nombre ?? c.id

export async function diagnosticarLocal(uri: string): Promise<Resultado & { vision: Vision }> {
  const t0 = Date.now()
  let vuelta = t0
  const reloj = () => { const a = Date.now(), d = a - vuelta; vuelta = a; return d }
  const mr: Manifest = manifest('router')
  const vision: Vision = { calor: null, contorno: [] }
  const r: Resultado & { vision: Vision } = { estado: 'rechazada', cultivo: null, clase: null, etiqueta: null, confianza: null,
    top3: [], motivo: null, ms: 0, version: mr.version, origen: 'telefono', pasos: [], vision }
  const paso = (id: string, titulo: string, detalle: string, ms: number) => r.pasos!.push({ id, titulo, detalle, ms })
  const fin = () => ((r.ms = Date.now() - t0), r)

  // La foto se convierte una sola vez por tamaño (router y especialistas usan el mismo).
  const tensores: Record<string, Promise<Float32Array>> = {}
  const tensor: Tensor = (alto, ancho) => (tensores[`${alto}x${ancho}`] ??= aTensor(uri, alto, ancho))
  const hoja = ubicarHoja(tensor).then((s) => ({ s, ms: Date.now() - t0 }))

  // 1. Router: ¿qué cultivo es?
  const pr = softmax((await predecir('router', tensor)).logits, mr.temperatura ?? 1)
  const i = pr.indexOf(Math.max(...pr)), cultivo = mr.clases[i].id
  paso('router', '¿Qué planta es?', `${etiqueta(mr.clases[i])} con ${pct(pr[i])} de confianza`, reloj())
  if ((mr.rechazo ?? ['otra_planta', 'no_planta']).includes(cultivo)) return (r.motivo = MOTIVOS[cultivo as 'no_planta'] ?? MOTIVOS.otra_planta), fin()
  if (pr[i] < (mr.umbral ?? 0.6)) return (r.estado = 'no_concluyente'), (r.motivo = MOTIVOS.router_duda), fin()
  r.cultivo = cultivo

  // 2. Especialista: comprobar si el modelo está disponible
  const nombre = ((mr.especialistas ?? ESPECIALISTAS) as Record<string, string>)[cultivo]
  const disponible = await estaModeloInstalado(nombre)
  if (!disponible) {
    r.estado = 'no_concluyente'
    r.faltaModelo = nombre
    r.motivo = `Reconocimos que la planta es ${NOMBRES_CULTIVO[cultivo] ?? cultivo}. El modelo especialista de ${nombreVisibleGrupo(nombre)} no está descargado aún.`
    paso('especialista', `Modelo de ${NOMBRES_CULTIVO[cultivo] ?? cultivo}`, `Pendiente de descarga: ${nombreVisibleGrupo(nombre)}`, reloj())
    return fin()
  }

  const me: Manifest | null = manifest(nombre)
  if (!me) return (r.estado = 'no_concluyente'), (r.motivo = MOTIVOS.sin_especialista), fin()
  const salida = await predecir(nombre, tensor)
  const idx = me.clases.map((c, k) => (c.cultivo ?? c.id.split('_')[0]) === cultivo ? k : -1).filter((k) => k >= 0)
  const p = softmax(idx.map((k) => salida.logits[k]), me.temperatura ?? 1)
  paso('especialista', `Modelo de ${NOMBRES_CULTIVO[cultivo] ?? cultivo}`, `Compara la foto con ${idx.length} condiciones que conoce`, reloj())

  // 3. Calibración y umbral
  const orden = p.map((v, j) => [v, idx[j]] as const).sort((a, b) => b[0] - a[0])
  r.top3 = orden.slice(0, 3).map(([v, k]) => ({ clase: me.clases[k].id, etiqueta: etiqueta(me.clases[k]), confianza: v }))
  let [conf, mejor] = orden[0]
  r.confianza = conf
  r.version = `${mr.version} + ${nombre} ${me.version}`
  const umbral = me.umbral ?? 0.6
  paso('calibracion', '¿Qué tan segura está?', `Confianza calibrada ${pct(conf)}; mínimo exigido ${pct(umbral)}`, reloj())
  if (conf < umbral) { r.estado = 'no_concluyente'; r.motivo = MOTIVOS.especialista_duda }
  else { r.estado = 'diagnostico'; r.clase = me.clases[mejor].id; r.etiqueta = etiqueta(me.clases[mejor]) }

  // 4. Dónde está la hoja (se calculó en paralelo; solo para mostrar)
  const { s: seg, ms } = await hoja
  reloj()
  let mascara = seg?.ok ? seg.mascara : null
  let detalle = mascara ? `Ubicó la planta: ocupa el ${pct(seg!.cobertura)} de la foto` : 'No se pudo separar la planta del fondo con seguridad; se usa la foto completa'

  // Detección de daño por mordedura (huecos de gusano cogollero) para maíz:
  const claseModelo = me.clases[mejor].id
  if (cultivo === 'maiz' && (claseModelo === 'maiz_tizon_hoja' || claseModelo === 'maiz_gusano_cogollero') && seg?.ok && seg.mascara) {
    const rgb512 = await tensor(512, 512)
    const mordedura = huecosMordedura(seg.mascara, rgb512, 512)
    if (mordedura.fuerte) {
      const kCogollero = idx.find((k) => me.clases[k].id === 'maiz_gusano_cogollero')
      const confCogollero = kCogollero !== undefined ? p[idx.indexOf(kCogollero)] : 0
      const claseCogollero = kCogollero !== undefined ? me.clases[kCogollero] : null
      r.estado = 'diagnostico'
      r.clase = 'maiz_gusano_cogollero'
      r.etiqueta = claseCogollero ? etiqueta(claseCogollero) : 'Gusano cogollero'
      r.confianza = Math.max(confCogollero, 0.6)
      r.motivo = 'Se detectaron varios huecos de mordedura en la hoja.'
      if (kCogollero !== undefined) mejor = kCogollero
    }
  }

  if (mascara && !aptaPara(seg!, cultivo)) { mascara = null; detalle = 'La forma ubicada no parece una sola mazorca; se usa la foto completa' }
  const [h, w] = salida.camTam
  if (mascara && salida.cam && fraccionDentro(salida.cam, mejor, h, w, mascara) < ATENCION_MIN_DENTRO) {
    mascara = null; detalle = 'La IA miró sobre todo fuera de la zona ubicada; se muestra la foto completa'
  }
  paso('segmentacion', '¿Dónde está la hoja?', detalle, ms)
  if (mascara) vision.contorno = seg!.contorno

  // 5. Mapa de calor de la clase ganadora (solo sobre la hoja si se ubicó)
  if (salida.cam) {
    try {
      vision.calor = mapaCalor(salida.cam, mejor, h, w, mascara)
      paso('mapa_calor', '¿Dónde miró?', 'Las zonas rojas son las que más pesaron en la decisión', reloj())
    } catch { /* sin mapa de calor */ }
  }
  return fin()
}
