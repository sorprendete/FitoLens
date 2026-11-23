// DiagnÃ³stico sin internet: router (Â¿quÃ© cultivo?) â†’ especialista del cultivo. Misma lÃ³gica que api/app/ia/pipeline.py.
// En paralelo, U2-Net-p ubica la hoja (solo para dibujar el contorno y recortar el mapa de calor: no cambia el diagnÃ³stico).
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
  motivo_codigo?: string | null
  prob_cultivos?: number
  prob_otra?: number
  prob_no_planta?: number
  energia?: number
}
// "VisiÃ³n de la IA": va aparte del resultado para no llenar el historial con imÃ¡genes.
export type Vision = { calor: string | null; contorno: Punto[][] }

type Clase = { id: string; etiqueta?: string; nombre?: string; cultivo?: string | null }
type Manifest = {
  version: string; clases: Clase[]; entrada: { alto: number; ancho: number }
  salidas?: { cam?: string; cam_tam?: [number, number] }
  temperatura?: number; umbral?: number; rechazo?: string[]; especialistas?: Record<string, string>
}

export const OOD_MIN_CULTIVOS = 0.70
export const OOD_U1 = 0.25
export const OOD_U2 = 0.55
export const OOD_U3: number | null = null
export const OOD_U4: number | null = null
export const MOTIVO_NO_PLANTA = 'Esto no parece una planta. Toma una foto de cerca de una hoja, fruto o mazorca.'
export const MOTIVO_OTRA_PLANTA = 'Es una planta, pero no es de los cultivos que FitoLens analiza: cafe, cacao, maiz, papa, tomate, pimiento, limon y naranja.'
export const MOTIVO_OOD = MOTIVO_OTRA_PLANTA
export const MOTIVO_NO_CONCLUYENTE = 'No estoy seguro. Toma otra foto mÃ¡s cerca y con buena luz.'

const MOTIVOS = {
  no_planta: MOTIVO_NO_PLANTA,
  otra_planta: MOTIVO_OTRA_PLANTA,
  router_duda: 'No se pudo reconocer el cultivo con seguridad. Prueba con una foto mÃ¡s cercana y nÃ­tida.',
  sin_especialista: 'TodavÃ­a no hay un modelo instalado para este cultivo.',
  especialista_duda: MOTIVO_NO_CONCLUYENTE,
  ood: MOTIVO_OTRA_PLANTA,
}
const ESPECIALISTAS = { pimiento: 'hortalizas', papa: 'hortalizas', tomate: 'hortalizas', cafe: 'cafe', cacao: 'cacao', maiz: 'maiz', limon: 'citricos', naranja: 'citricos' }
export const NOMBRES_CULTIVO: Record<string, string> = { pimiento: 'pimiento', papa: 'papa', tomate: 'tomate', cafe: 'cafÃ©', cacao: 'cacao', maiz: 'maÃ­z', limon: 'limÃ³n', naranja: 'naranja' }
const pct = (v: number) => `${Math.round(v * 100)} %`

// onnxruntime es nativo: no existe en Expo Go. AhÃ­ la app diagnostica con el servidor.
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
      if (!fuente) throw new Error(`El modelo ${nombre} no estÃ¡ instalado.`)
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
    } catch { /* sin mapa de calor, el diagnÃ³stico sigue */ }
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
  } catch { return null } // nunca rompe un diagnÃ³stico
}

const softmax = (x: number[], t = 1) => {
  const z = x.map((v) => v / t), mx = Math.max(...z), e = z.map((v) => Math.exp(v - mx)), s = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / s)
}

export const logsumexp = (logits: number[]): number => {
  const mx = Math.max(...logits)
  let sum = 0
  for (const v of logits) {
    sum += Math.exp(v - mx)
  }
  return mx + Math.log(sum)
}

export const energia = (logits: number[]): number => -logsumexp(logits)

export const entropiaNormalizada = (p: number[]): number => {
  const k = p.length
  if (k <= 1) return 0
  let h = 0
  for (const v of p) {
    if (v > 0) h -= v * Math.log(v)
  }
  return h / Math.log(k)
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
  const fin = () => {
    if (r.confianza !== null && r.confianza > 0.99) {
      r.confianza = 0.99
    }
    r.ms = Date.now() - t0
    return r
  }

  // La foto se convierte una sola vez por tamaÃ±o (router y especialistas usan el mismo).
  const tensores: Record<string, Promise<Float32Array>> = {}
  const tensor: Tensor = (alto, ancho) => (tensores[`${alto}x${ancho}`] ??= aTensor(uri, alto, ancho))
  const hoja = ubicarHoja(tensor).then((s) => ({ s, ms: Date.now() - t0 }))

  // 1. Router: Â¿quÃ© cultivo es?
  const salidaRouter = await predecir('router', tensor)
  const logitsRouter = salidaRouter.logits
  const pr = softmax(logitsRouter, mr.temperatura ?? 1)
  const i = pr.indexOf(Math.max(...pr)), cultivo = mr.clases[i].id
  const confGanadora = pr[i]
  const rechazoIds = new Set(mr.rechazo ?? ['otra_planta', 'no_planta'])

  let probNoPlanta = 0
  let probOtraPlanta = 0
  let probCultivos = 0
  for (let k = 0; k < mr.clases.length; k++) {
    const cid = mr.clases[k].id
    if (cid === 'no_planta') probNoPlanta = pr[k]
    else if (cid === 'otra_planta') probOtraPlanta = pr[k]
    else if (!rechazoIds.has(cid)) probCultivos += pr[k]
  }

  const energiaRouter = energia(logitsRouter)
  r.prob_cultivos = Math.round(probCultivos * 10000) / 10000
  r.prob_otra = Math.round(probOtraPlanta * 10000) / 10000
  r.prob_no_planta = Math.round(probNoPlanta * 10000) / 10000
  r.energia = Math.round(energiaRouter * 10000) / 10000

  paso('router', 'Â¿QuÃ© planta es?', `${etiqueta(mr.clases[i])} con ${pct(confGanadora)} de confianza`, reloj())

  // PASO 1 'Â¿es una planta?': si p(no_planta) es la mayor o p(no_planta) > p(otra_planta) y la suma de cultivos < 0.70
  if (cultivo === 'no_planta' || (probNoPlanta > probOtraPlanta && probCultivos < OOD_MIN_CULTIVOS)) {
    r.estado = 'rechazada'
    r.motivo_codigo = 'no_planta'
    r.motivo = MOTIVO_NO_PLANTA
    return fin()
  }

  // PASO 2 'Â¿es un cultivo que analizo?': si la ganadora es otra_planta o la suma de cultivos soportados < 0.70
  if (cultivo === 'otra_planta' || probCultivos < OOD_MIN_CULTIVOS) {
    r.estado = 'rechazada'
    r.motivo_codigo = 'otra_planta'
    r.motivo = MOTIVO_OTRA_PLANTA
    return fin()
  }

  // Reglas de energÃ­a en router (desactivadas por defecto)
  if (OOD_U3 !== null && energiaRouter > OOD_U3) {
    r.estado = 'rechazada'
    if (probNoPlanta > probOtraPlanta) {
      r.motivo_codigo = 'no_planta'
      r.motivo = MOTIVO_NO_PLANTA
    } else {
      r.motivo_codigo = 'otra_planta'
      r.motivo = MOTIVO_OTRA_PLANTA
    }
    return fin()
  }

  if (confGanadora < (mr.umbral ?? 0.6)) {
    r.estado = 'no_concluyente'
    r.motivo_codigo = 'no_concluyente'
    r.motivo = MOTIVOS.router_duda
    return fin()
  }
  r.cultivo = cultivo

  // 2. Especialista: comprobar si el modelo estÃ¡ disponible
  const nombre = ((mr.especialistas ?? ESPECIALISTAS) as Record<string, string>)[cultivo]
  const disponible = await estaModeloInstalado(nombre)
  if (!disponible) {
    r.estado = 'no_concluyente'
    r.motivo_codigo = 'no_concluyente'
    r.faltaModelo = nombre
    r.motivo = `Reconocimos que la planta es ${NOMBRES_CULTIVO[cultivo] ?? cultivo}. El modelo especialista de ${nombreVisibleGrupo(nombre)} no estÃ¡ descargado aÃºn.`
    paso('especialista', `Modelo de ${NOMBRES_CULTIVO[cultivo] ?? cultivo}`, `Pendiente de descarga: ${nombreVisibleGrupo(nombre)}`, reloj())
    return fin()
  }

  const me: Manifest | null = manifest(nombre)
  if (!me) {
    r.estado = 'no_concluyente'
    r.motivo_codigo = 'no_concluyente'
    r.motivo = MOTIVOS.sin_especialista
    return fin()
  }
  const salida = await predecir(nombre, tensor)
  const energiaEsp = energia(salida.logits)
  if (OOD_U4 !== null && energiaEsp > OOD_U4) {
    r.estado = 'rechazada'
    r.cultivo = null
    r.clase = null
    r.etiqueta = null
    r.confianza = null
    r.top3 = []
    r.motivo_codigo = 'otra_planta'
    r.motivo = MOTIVO_OTRA_PLANTA
    return fin()
  }

  const idx = me.clases.map((c, k) => (c.cultivo ?? c.id.split('_')[0]) === cultivo ? k : -1).filter((k) => k >= 0)
  const p = softmax(idx.map((k) => salida.logits[k]), me.temperatura ?? 1)
  paso('especialista', `Modelo de ${NOMBRES_CULTIVO[cultivo] ?? cultivo}`, `Compara la foto con ${idx.length} condiciones que conoce`, reloj())

  // 3. CalibraciÃ³n y umbral
  const orden = p.map((v, j) => [v, idx[j]] as const).sort((a, b) => b[0] - a[0])
  r.top3 = orden.slice(0, 3).map(([v, k]) => ({
    clase: me.clases[k].id,
    etiqueta: etiqueta(me.clases[k]),
    confianza: Math.min(Number((confGanadora * v).toFixed(4)), 0.99),
  }))
  let [confEsp, mejor] = orden[0]
  const conf = Math.min(Number((confGanadora * confEsp).toFixed(4)), 0.99)
  r.confianza = conf
  r.version = `${mr.version} + ${nombre} ${me.version}`
  const umbral = me.umbral ?? 0.6
  paso('calibracion', 'Â¿QuÃ© tan segura estÃ¡?', `Confianza calibrada ${pct(conf)}; mÃ­nimo exigido ${pct(umbral)}`, reloj())
  if (conf < umbral) {
    r.estado = 'no_concluyente'
    r.motivo_codigo = 'no_concluyente'
    r.motivo = MOTIVOS.especialista_duda
  } else {
    r.estado = 'diagnostico'
    r.clase = me.clases[mejor].id
    r.etiqueta = etiqueta(me.clases[mejor])
  }

  // 4. DÃ³nde estÃ¡ la hoja (se calculÃ³ en paralelo; solo para mostrar)
  const { s: seg, ms } = await hoja
  reloj()
  let mascara = seg?.ok ? seg.mascara : null
  let detalle = mascara ? `UbicÃ³ la planta: ocupa el ${pct(seg!.cobertura)} de la foto` : 'No se pudo separar la planta del fondo con seguridad; se usa la foto completa'

  // DetecciÃ³n de daÃ±o por mordedura (huecos de gusano cogollero) para maÃ­z:
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
      r.confianza = Math.min(Number(Math.max(probCultivos * confCogollero, 0.6).toFixed(4)), 0.99)
      r.motivo = 'Se detectaron varios huecos de mordedura en la hoja.'
      if (kCogollero !== undefined) mejor = kCogollero
    }
  }

  if (mascara && !aptaPara(seg!, cultivo)) { mascara = null; detalle = 'La forma ubicada no parece una sola mazorca; se usa la foto completa' }
  const [h, w] = salida.camTam
  if (mascara && salida.cam && fraccionDentro(salida.cam, mejor, h, w, mascara) < ATENCION_MIN_DENTRO) {
    mascara = null; detalle = 'La IA mirÃ³ sobre todo fuera de la zona ubicada; se muestra la foto completa'
  }
  paso('segmentacion', 'Â¿DÃ³nde estÃ¡ la hoja?', detalle, ms)
  if (mascara) vision.contorno = seg!.contorno

  // 5. Mapa de calor de la clase ganadora (solo sobre la hoja si se ubicÃ³)
  if (salida.cam) {
    try {
      vision.calor = mapaCalor(salida.cam, mejor, h, w, mascara)
      paso('mapa_calor', 'Â¿DÃ³nde mirÃ³?', 'Las zonas rojas son las que mÃ¡s pesaron en la decisiÃ³n', reloj())
    } catch { /* sin mapa de calor */ }
  }
  return fin()
}
