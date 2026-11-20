// Datos de ejemplo para trabajar sin API. NO son resultados reales del modelo:
// la interfaz muestra "Modo demostración" mientras se usan.
import { PROVINCIAS } from '../datos/provincias'

const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const azar = (a, b) => a + Math.random() * (b - a)

// Mapa de calor falso: manchas gaussianas en colores tipo "jet" sobre un lienzo transparente.
async function calorFalso(imagen) {
  const bmp = await createImageBitmap(imagen)
  const ancho = 224, alto = Math.round(224 * bmp.height / bmp.width)
  const c = new OffscreenCanvas(ancho, alto), g = c.getContext('2d')
  const img = g.createImageData(ancho, alto)
  const focos = Array.from({ length: 3 }, () => [azar(.25, .75) * ancho, azar(.25, .75) * alto, azar(25, 55)])
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
    let v = 0
    for (const [fx, fy, r] of focos) v += Math.exp(-((x - fx) ** 2 + (y - fy) ** 2) / (2 * r * r))
    v = Math.min(1, v)
    const i = (y * ancho + x) * 4
    img.data[i] = 255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 3)))
    img.data[i + 1] = 255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 2)))
    img.data[i + 2] = 255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 1)))
    img.data[i + 3] = 220 * Math.min(1, v * 1.3)
  }
  g.putImageData(img, 0, 0)
  const blob = await c.convertToBlob({ type: 'image/png' })
  const b = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192))
  return btoa(s)
}

const ESCENARIOS = [
  { cultivo: 'cafe', clases: ['cafe_roya', 'cafe_ojo_de_gallo', 'cafe_sana'] },
  { cultivo: 'cacao', clases: ['cacao_monilia', 'cacao_mazorca_negra', 'cacao_sana'] },
  { cultivo: 'tomate', clases: ['tomate_tizon_tardio', 'tomate_tizon_temprano', 'tomate_septoria'] },
]

export async function diagnostico(imagen) {
  await espera(900)
  const tirada = Math.random()
  const esc = ESCENARIOS[Math.floor(Math.random() * ESCENARIOS.length)]
  const router = { id: 'router', titulo: 'Reconocer el cultivo', ms: 38 }
  if (tirada < 0.1) return {
    cultivo: null, estado: 'rechazada', clase: null, confianza: 0.91, top3: [], mapa_calor_png_base64: null,
    motivo: 'La foto no parece una hoja o mazorca de un cultivo soportado.',
    pasos: [{ ...router, detalle: 'No es planta (91 %)' }], modelo_version: 'demo',
  }
  const c1 = tirada < 0.25 ? azar(.42, .58) : azar(.82, .97)
  const c2 = (1 - c1) * azar(.55, .8)
  const top3 = [[esc.clases[0], c1], [esc.clases[1], c2], [esc.clases[2], 1 - c1 - c2]].map(([clase, confianza]) => ({ clase, confianza }))
  const concluye = c1 >= 0.6
  return {
    cultivo: esc.cultivo, estado: concluye ? 'diagnostico' : 'no_concluyente', clase: esc.clases[0], confianza: c1, top3,
    mapa_calor_png_base64: await calorFalso(imagen),
    motivo: concluye ? null : 'La confianza calibrada no supera el umbral del 60 %. Toma otra foto más cerca y con buena luz.',
    pasos: [
      { ...router, detalle: `${esc.cultivo === 'cafe' ? 'Café' : esc.cultivo === 'cacao' ? 'Cacao' : 'Tomate'} (98 %)` },
      { id: 'especialista', titulo: 'Analizar con el especialista', detalle: 'EfficientNetV2-B2 · 288 px', ms: 182 },
      { id: 'calibracion', titulo: 'Calibrar la confianza', detalle: `T = 1.4 · umbral 60 %`, ms: 1 },
      { id: 'mapa_calor', titulo: 'Señalar la zona afectada', detalle: 'CAM de la última capa', ms: 9 },
    ],
    modelo_version: 'demo',
  }
}

const ENFERMEDADES = ['cafe_roya', 'cafe_ojo_de_gallo', 'cacao_monilia', 'cacao_mazorca_negra', 'papa_tizon_tardio', 'tomate_tizon_tardio']
// Peso fijo por provincia para que el ejemplo sea estable entre recargas.
const PESO = { moyobamba: 9, rioja: 8, lamas: 6, san_martin: 7, el_dorado: 3, picota: 4, bellavista: 5, huallaga: 2, mariscal_caceres: 6, tocache: 7 }

export async function brotes(desde) {
  await espera(250)
  const dias = Math.max(1, (Date.now() - new Date(desde)) / 864e5)
  const f = Math.sqrt(dias / 30)
  const provincias = PROVINCIAS.map(({ id }, i) => {
    const por_clase = {}
    ENFERMEDADES.forEach((e, j) => {
      const afin = (e.startsWith('cafe') && i % 2 === 0) || (e.startsWith('cacao') && i % 2 === 1) ? 2 : .6
      por_clase[e] = Math.round(PESO[id] * afin * f * (1 + ((i * 7 + j * 3) % 5) / 4))
    })
    return { provincia: id, total: Object.values(por_clase).reduce((a, b) => a + b, 0), por_clase }
  })
  return { desde, total: provincias.reduce((a, p) => a + p.total, 0), provincias }
}

const matriz = (n, acierto) => Array.from({ length: n }, (_, i) =>
  Array.from({ length: n }, (_, j) => (i === j ? Math.round(40 * acierto) : Math.round(40 * (1 - acierto) / (n - 1)))))

export async function metricas() {
  await espera(200)
  const m = (id, cultivo, clases, acc, f1, n, lab) => ({
    id, cultivo, version: 'demo', backbone: 'EfficientNetV2-B2', clases, umbral: 0.6, latencia_ms: 180,
    campo: { accuracy: acc, f1_macro: f1, n, matriz_confusion: matriz(clases.length, acc) }, laboratorio: { accuracy: lab },
  })
  return {
    modelos: [
      m('cafe', 'cafe', ['cafe_sana', 'cafe_roya', 'cafe_ojo_de_gallo'], .9, .89, 225, .97),
      m('cacao', 'cacao', ['cacao_sana', 'cacao_monilia', 'cacao_mazorca_negra'], .86, .84, 300, .95),
      m('hortalizas', 'tomate', ['tomate_sana', 'tomate_tizon_temprano', 'tomate_tizon_tardio', 'papa_tizon_tardio'], .78, .75, 180, .97),
    ],
  }
}

// ---------- Cuentas y administración (solo con VITE_MODO_DEMO=true) ----------
let usuarioDemo = { id: 1, email: 'admin@fitolens.pe', nombre: 'Ronald', rol: 'admin' }
export async function login(email, nombre) {
  await espera(500)
  usuarioDemo = { id: 1, email, nombre: nombre || email.split('@')[0], rol: email.startsWith('admin') ? 'admin' : 'usuario' }
  return { access_token: 'demo', token_type: 'bearer', usuario: usuarioDemo }
}
export const yo = async () => usuarioDemo

const PROV_IDS = PROVINCIAS.map((p) => p.id)
const TODAS = ['cafe_roya', 'cafe_sana', 'cafe_ojo_de_gallo', 'cacao_monilia', 'cacao_sana', 'cacao_mazorca_negra', 'papa_tizon_tardio', 'tomate_tizon_temprano', 'tomate_sana']
export async function historial() {
  await espera(300)
  const items = Array.from({ length: 64 }, (_, i) => {
    const r = (i * 9301 + 49297) % 233280 / 233280
    const clase = TODAS[i % TODAS.length]
    const estado = r < 0.08 ? 'rechazada' : r < 0.2 ? 'no_concluyente' : 'diagnostico'
    return {
      id: 1000 - i, creado: new Date(Date.now() - i * 5.3 * 36e5).toISOString(),
      cultivo: estado === 'rechazada' ? null : clase.split('_')[0], estado,
      clase: estado === 'rechazada' ? null : clase, confianza: estado === 'no_concluyente' ? 0.45 + r : 0.8 + r * 0.19,
      provincia: PROV_IDS[i % PROV_IDS.length],
      origen: i % 3 === 0 ? 'app' : 'web',
    }
  })
  return { items }
}

export const resumen = async () => ({ usuarios: 48, analisis: 1264, sanos: 402, enfermos: 701, no_concluyentes: 112, rechazadas: 49, logins_fallidos_24h: 17, bloqueos_24h: 2 })

const NOMBRES = ['Ronald', 'María Flores', 'José Tapullima', 'Lucía Pinedo', 'Carlos Sangama', 'Rosa Amasifuén', 'Pedro Salas', 'Ana Del Águila']
export async function usuarios() {
  await espera(250)
  return NOMBRES.map((nombre, i) => ({
    id: i + 1, nombre, email: i ? `${nombre.split(' ')[0].toLowerCase()}@correo.pe` : 'admin@fitolens.pe',
    rol: i ? 'usuario' : 'admin', activo: i !== 6, creado: new Date(Date.now() - (i + 1) * 3 * 864e5).toISOString(),
    ultimo_acceso: new Date(Date.now() - i * 7 * 36e5).toISOString(), diagnosticos: 80 - i * 9,
  }))
}

const ACC = [['login', 'exito'], ['diagnostico', 'exito'], ['login', 'fallo'], ['diagnostico', 'exito'], ['registro', 'exito'], ['login', 'bloqueado'], ['admin', 'exito'], ['diagnostico', 'fallo']]
export async function auditoria({ accion, estado } = {}) {
  await espera(250)
  return Array.from({ length: 80 }, (_, i) => {
    const [a, e] = ACC[i % ACC.length]
    return {
      id: 5000 - i, fecha: new Date(Date.now() - i * 41 * 6e4).toISOString(), accion: a, estado: e,
      email: e === 'bloqueado' || (a === 'login' && e === 'fallo') ? 'admin@fitolens.pe' : `${NOMBRES[i % 8].split(' ')[0].toLowerCase()}@correo.pe`,
      ip: e === 'bloqueado' || e === 'fallo' ? '45.161.12.' + (i % 3 + 7) : `181.65.${i % 40}.${(i * 7) % 250}`,
      agente: i % 5 === 2 ? 'python-requests/2.32' : 'Mozilla/5.0 (Android 14) Chrome/131',
      detalle: { login: 'Inicio de sesión', diagnostico: 'Foto analizada', registro: 'Cuenta creada', admin: 'Cuenta desactivada' }[a],
    }
  }).filter((x) => (!accion || x.accion === accion) && (!estado || x.estado === estado))
}

export async function amenazas(dias) {
  await espera(700)
  const ip = (ipx, nivel, puntaje, reglas, explicacion, c) => ({ ip: ipx, nivel, puntaje, anomalia_ml: puntaje >= 55, solo_ml: puntaje >= 55 && !reglas.length, reglas, explicacion, caracteristicas: c })
  const ips = [
    ip('45.161.12.8', 'alto', 78.4, [{ tipo: 'Fuerza bruta', detalle: '23 contraseñas fallidas', grave: true }, { tipo: 'Prueba de cuentas', detalle: '7 correos distintos', grave: true }],
      ['23 contraseñas fallidas (lo normal es 0)', 'Cliente automatizado: python-requests'], { eventos: 41, fallos_login: 23, correos_distintos: 7, automatizado: 1 }),
    ip('190.42.7.33', 'medio', 61.2, [], ['El 80 % de su actividad fue de madrugada (0 a 5 h)', '32 eventos en un mismo minuto (lo normal es 2)'], { eventos: 58, max_por_minuto: 32, frac_nocturna: 0.8 }),
    ip('179.7.88.120', 'medio', 49.5, [{ tipo: 'Muchas imágenes rechazadas', detalle: '14 fotos que no eran plantas', grave: false }], [], { eventos: 22, rechazos: 14 }),
    ...Array.from({ length: 9 }, (_, i) => ip(`181.65.${i * 3}.${20 + i}`, 'normal', 38 + i * 1.3, [], [], { eventos: 6 + i })),
  ]
  return {
    fuente: 'simulado', dias,
    resumen: { eventos: 1840, ips: ips.length, alto: 1, medio: 2, solo_ml: 1, por_tipo: { 'Fuerza bruta': 1, 'Prueba de cuentas': 1, 'Muchas imágenes rechazadas': 1, 'Comportamiento anómalo (solo ML)': 1 } },
    modelo: { algoritmo: 'Isolation Forest (scikit-learn, no supervisado)', entrenado: true, motivo: null, arboles: 300, umbral_puntaje: 55,
      caracteristicas: ['eventos', 'contraseñas fallidas', 'cuentas distintas usadas', 'imágenes rechazadas', 'eventos en un mismo minuto', 'actividad de madrugada', 'cliente automatizado'] },
    ips,
  }
}
