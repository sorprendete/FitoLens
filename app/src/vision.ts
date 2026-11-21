// "Visión de la IA" en el teléfono, sin internet. Copia de api/app/ia/segmentacion.py y api/app/ia/mapa_calor.py:
// si cambias las reglas allá, cámbialas aquí.
// - Contorno: U2-Net-p (192 px) ubica la hoja o mazorca. Solo se usa para dibujar el contorno y recortar el mapa de calor;
//   el diagnóstico sigue usando la foto completa. Si algo sale dudoso, no se muestra contorno y todo sigue igual.
// - Mapa de calor: CAM de la clase elegida (salida "cam" del especialista), azul → rojo, zonas frías transparentes.
// Este archivo no importa nada de React Native, para poder probarlo con Node contra la versión en Python.
import { pngBase64 } from './png'

export const LADO = 192
const COBERTURA_MIN = 0.02, COBERTURA_MAX = 0.95, CONFIANZA_MIN = 0.66, NUCLEO_MIN = 0.75
const COBERTURA_GRANDE = 0.75, CONFIANZA_GRANDE = 0.9
const SOLIDEZ_MIN: Record<string, number> = { cacao: 0.75 }
const MAX_POLIGONOS = 5, MAX_PUNTOS = 120

// Umbrales para detección de huecos de gusano cogollero en maíz
export const LADO_HUECOS = 512
export const UMBRAL_HUECO_RUIDO_FRAC = 0.0004 // Descarta componentes < 0.04 % del área de la hoja
export const UMBRAL_HUECO_ASPECTO_MAX = 6.0 // Descarta componentes alargados (relación de aspecto > 6)
export const UMBRAL_HUECO_SOLIDEZ_MIN = 0.4 // Descarta componentes no convexos / hendiduras (solidez < 0.4)
export const UMBRAL_HUECO_BORDE_PCT = 0.02 // Margen del contorno exterior (2 % del lado de la imagen)

export const HUECOS_FUERTE_MIN_CANTIDAD = 4
export const HUECOS_FUERTE_MIN_FRACCION = 0.008
export const HUECOS_FUERTE_MODERADO_CANTIDAD = 2
export const HUECOS_FUERTE_MODERADO_FRACCION = 0.03
export const HUECOS_FUERTE_GRANDE_CANTIDAD = HUECOS_FUERTE_MODERADO_CANTIDAD
export const HUECOS_FUERTE_GRANDE_FRACCION = HUECOS_FUERTE_MODERADO_FRACCION

export type ResultadoHuecos = { cantidad: number; fraccion: number; fuerte: boolean }

export type Punto = [number, number]
export type Segmentacion = {
  ok: boolean; mascara: Uint8Array | null; cobertura: number; confianza: number; nucleo: number; solidez: number
  contorno: Punto[][]; motivo: string | null
}

// ---- utilidades de imagen (arreglos planos, fila por fila) ----
const refleja = (i: number, n: number) => { while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1; return i }

function gaussiana(p: Float32Array, n: number, sigma = 1): Float32Array {
  const r = Math.round(4 * sigma), k: number[] = []
  for (let i = -r; i <= r; i++) k.push(Math.exp((-i * i) / (2 * sigma * sigma)))
  const s = k.reduce((a, b) => a + b, 0), kn = k.map((v) => v / s)
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0
    for (let j = -r; j <= r; j++) v += kn[j + r] * p[y * n + refleja(x + j, n)]
    tmp[y * n + x] = v
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0
    for (let j = -r; j <= r; j++) v += kn[j + r] * tmp[refleja(y + j, n) * n + x]
    out[y * n + x] = v
  }
  return out
}

// Componentes conexas con 8 vecinos. Devuelve etiquetas (0 = fondo) y el área de cada una (índice = etiqueta - 1).
function etiquetar(m: Uint8Array, n: number): { et: Int32Array; areas: number[] } {
  const et = new Int32Array(n * n), areas: number[] = [], pila: number[] = []
  for (let i = 0; i < n * n; i++) {
    if (!m[i] || et[i]) continue
    const e = areas.length + 1
    let area = 0
    et[i] = e; pila.push(i)
    while (pila.length) {
      const q = pila.pop()!, y = (q / n) | 0, x = q - y * n
      area++
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx
        if (yy < 0 || xx < 0 || yy >= n || xx >= n) continue
        const w = yy * n + xx
        if (m[w] && !et[w]) { et[w] = e; pila.push(w) }
      }
    }
    areas.push(area)
  }
  return { et, areas }
}

// Rellena huecos: el fondo que no toca el borde (4 vecinos) pasa a ser objeto.
function rellenar(m: Uint8Array, n: number): Uint8Array {
  const fuera = new Uint8Array(n * n), pila: number[] = []
  const empuja = (i: number) => { if (!m[i] && !fuera[i]) { fuera[i] = 1; pila.push(i) } }
  for (let i = 0; i < n; i++) { empuja(i); empuja((n - 1) * n + i); empuja(i * n); empuja(i * n + n - 1) }
  while (pila.length) {
    const q = pila.pop()!, y = (q / n) | 0, x = q - y * n
    if (x > 0) empuja(q - 1); if (x < n - 1) empuja(q + 1); if (y > 0) empuja(q - n); if (y < n - 1) empuja(q + n)
  }
  const out = new Uint8Array(n * n)
  for (let i = 0; i < n * n; i++) out[i] = fuera[i] ? 0 : 1
  return out
}

function dilatar(m: Uint8Array, n: number, veces: number): Uint8Array {
  let a = m
  for (let t = 0; t < veces; t++) {
    const b = new Uint8Array(a)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x
      if (a[i]) continue
      if ((x > 0 && a[i - 1]) || (x < n - 1 && a[i + 1]) || (y > 0 && a[i - n]) || (y < n - 1 && a[i + n])) b[i] = 1
    }
    a = b
  }
  return a
}

const redondea = (v: number) => Math.round(v * 1e4) / 1e4
const fallo = (motivo: string, d: Partial<Segmentacion> = {}): Segmentacion =>
  ({ ok: false, mascara: null, cobertura: 0, confianza: 0, nucleo: 0, solidez: 0, contorno: [], ...d, motivo })

// De la probabilidad por píxel (192×192, 0–1) a máscara limpia, métricas de confianza y contorno.
export function analizar(p: Float32Array, n = LADO): Segmentacion {
  const g = gaussiana(p, n)
  const m0 = new Uint8Array(n * n)
  for (let i = 0; i < n * n; i++) m0[i] = g[i] > 0.5 ? 1 : 0
  const { et, areas } = etiquetar(m0, n)
  if (!areas.length) return fallo('vacia')
  const orden = areas.map((a, k) => [a, k] as const).sort((a, b) => b[0] - a[0])
  const minimo = Math.max(0.15 * orden[0][0], 0.005 * n * n)
  const elegidas = orden.slice(0, MAX_POLIGONOS).filter(([a]) => a >= minimo).map(([, k]) => k + 1)
  const sel = new Uint8Array(n * n)
  for (let i = 0; i < n * n; i++) sel[i] = elegidas.includes(et[i]) ? 1 : 0
  const m = rellenar(sel, n)

  let suma = 0, nuc = 0, conf = 0, nz = 0
  const zona = dilatar(m, n, 6)
  for (let i = 0; i < n * n; i++) {
    if (m[i]) { suma++; if (p[i] > 0.8) nuc++ }
    if (zona[i]) { conf += Math.abs(2 * p[i] - 1); nz++ }
  }
  const cobertura = suma / (n * n), confianza = nz ? conf / nz : 0, nucleo = suma ? nuc / suma : 0
  const d = { mascara: m, cobertura: redondea(cobertura), confianza: redondea(confianza), nucleo: redondea(nucleo) }
  if (cobertura < COBERTURA_MIN) return fallo('muy_pequena', d)
  if (cobertura > COBERTURA_MAX) return fallo('toda_la_foto', d)
  if (confianza < CONFIANZA_MIN || nucleo < NUCLEO_MIN) return fallo('dudosa', d)
  if (cobertura > COBERTURA_GRANDE && confianza < CONFIANZA_GRANDE) return fallo('dudosa', d)

  const contorno = elegidas.map((e) => {
    const r = new Uint8Array(n * n)
    for (let i = 0; i < n * n; i++) r[i] = et[i] === e ? 1 : 0
    return trazar(r, n)
  }).filter((c) => c.length >= 3)
  if (!contorno.length) return fallo('sin_contorno', d)
  return { ok: true, ...d, contorno, solidez: redondea(Math.min(...contorno.map(solidez))), motivo: null }
}

// Reglas que dependen del cultivo (se conoce después del router).
export const aptaPara = (s: Segmentacion, cultivo: string | null) => s.ok && s.solidez >= (SOLIDEZ_MIN[cultivo ?? ''] ?? 0)

// ---- contorno ----
const VECINOS: Punto[] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]]

// Borde exterior de una región (Moore), simplificado y normalizado a 0–1.
function trazar(region: Uint8Array, n: number): Punto[] {
  const reg = rellenar(region, n), w = n + 2
  const r = new Uint8Array(w * w)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) r[(y + 1) * w + x + 1] = reg[y * n + x]
  const k = r.indexOf(1)
  if (k < 0) return []
  const inicio: Punto = [k % w, (k / w) | 0]
  const puntos: Punto[] = [inicio]
  let actual = inicio, direccion = 0
  for (let t = 0; t < 4 * r.length; t++) {
    let movio = false
    for (let i = 0; i < 8; i++) {
      const dd = (direccion + i) % 8, x = actual[0] + VECINOS[dd][0], y = actual[1] + VECINOS[dd][1]
      if (r[y * w + x]) { actual = [x, y]; direccion = (dd + 5) % 8; movio = true; break }
    }
    if (!movio) break
    if (actual[0] === inicio[0] && actual[1] === inicio[1]) break
    puntos.push(actual)
  }
  let pts: Punto[] = puntos.map(([x, y]) => [x - 0.5, y - 0.5])
  let tol = 0.6
  pts = simplificar(pts, tol)
  while (pts.length > MAX_PUNTOS) { tol *= 1.5; pts = simplificar(pts, tol) }
  const lim = (v: number) => redondea(Math.min(1, Math.max(0, v)))
  return pts.map(([x, y]) => [lim(x / n), lim(y / n)])
}

// Douglas-Peucker iterativo.
function simplificar(pts: Punto[], tolerancia: number): Punto[] {
  if (pts.length < 4) return pts
  const conservar = new Uint8Array(pts.length)
  conservar[0] = conservar[pts.length - 1] = 1
  const pila: [number, number][] = [[0, pts.length - 1]]
  while (pila.length) {
    const [a, b] = pila.pop()!
    if (b - a < 2) continue
    const sx = pts[b][0] - pts[a][0], sy = pts[b][1] - pts[a][1], largo = Math.hypot(sx, sy)
    let mejor = -1, dmax = -1
    for (let i = a + 1; i < b; i++) {
      const rx = pts[i][0] - pts[a][0], ry = pts[i][1] - pts[a][1]
      const dist = largo > 0 ? Math.abs(sx * ry - sy * rx) / largo : Math.hypot(rx, ry)
      if (dist > dmax) { dmax = dist; mejor = i }
    }
    if (dmax > tolerancia) { conservar[mejor] = 1; pila.push([a, mejor], [mejor, b]) }
  }
  return pts.filter((_, i) => conservar[i])
}

const areaPoligono = (p: Punto[]) => {
  let s = 0
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x0, y0] = p[(i + p.length - 1) % p.length]; s += x1 * y0 - y1 * x0 }
  return Math.abs(s) / 2
}

// Área / área de su envolvente convexa (1 = convexa).
function solidez(p: Punto[]): number {
  if (p.length < 3) return 0
  const o = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cruz = (a: Punto, b: Punto, c: Punto) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const inf: Punto[] = [], sup: Punto[] = []
  for (const q of o) { while (inf.length >= 2 && cruz(inf[inf.length - 2], inf[inf.length - 1], q) <= 0) inf.pop(); inf.push(q) }
  for (const q of [...o].reverse()) { while (sup.length >= 2 && cruz(sup[sup.length - 2], sup[sup.length - 1], q) <= 0) sup.pop(); sup.push(q) }
  const casco = inf.slice(0, -1).concat(sup.slice(0, -1)), ac = areaPoligono(casco)
  return ac > 1e-12 ? areaPoligono(p) / ac : 0
}

function areaCasco(pts: Punto[]): number {
  if (pts.length < 3) return 0
  const o = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cruz = (a: Punto, b: Punto, c: Punto) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const inf: Punto[] = [], sup: Punto[] = []
  for (const q of o) { while (inf.length >= 2 && cruz(inf[inf.length - 2], inf[inf.length - 1], q) <= 0) inf.pop(); inf.push(q) }
  for (const q of [...o].reverse()) { while (sup.length >= 2 && cruz(sup[sup.length - 2], sup[sup.length - 1], q) <= 0) sup.pop(); sup.push(q) }
  const casco = inf.slice(0, -1).concat(sup.slice(0, -1))
  return areaPoligono(casco)
}

function rgbALab(r: number, g: number, b: number): [number, number, number] {
  const cr = Math.min(1, Math.max(0, r)), cg = Math.min(1, Math.max(0, g)), cb = Math.min(1, Math.max(0, b))
  const fLin = (c: number) => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92)
  const rl = fLin(cr), gl = fLin(cg), bl = fLin(cb)
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750
  const z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883
  const delta = 6 / 29, delta3 = delta * delta * delta
  const f = (t: number) => (t > delta3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29)
  const fx = f(x), fy = f(y), fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function rgbAHsv(r: number, g: number, b: number): [number, number, number] {
  const cr = Math.min(1, Math.max(0, r)), cg = Math.min(1, Math.max(0, g)), cb = Math.min(1, Math.max(0, b))
  const mx = Math.max(cr, cg, cb), mn = Math.min(cr, cg, cb), df = mx - mn
  let h = 0
  if (df > 1e-6) {
    if (mx === cr) h = ((60 * ((cg - cb) / df) + 360) % 360)
    else if (mx === cg) h = 60 * ((cb - cr) / df) + 120
    else h = 60 * ((cr - cg) / df) + 240
  }
  const s = mx > 1e-6 ? df / mx : 0
  return [h, s, mx]
}

function esTejidoHoja(r: number, g: number, b: number, h: number, s: number, v: number): boolean {
  if ((h >= 55 && h <= 175 && s >= 0.12 && v >= 0.10) || (g >= r * 0.95 && g >= b * 1.02 && g >= 0.12)) return true
  if ((h >= 40 && h < 55 && s >= 0.10 && v >= 0.30) || (g >= r * 0.90 && g >= b * 0.95 && v >= 0.50)) return true
  if (h >= 15 && h <= 45 && s >= 0.40 && r > g && (r - b) >= 0.15 && v >= 0.15 && v <= 0.75) return true
  return false
}

function esVerde(r: number, g: number, b: number, h: number, s: number, v: number): boolean {
  return (h >= 55 && h <= 175 && s >= 0.12 && v >= 0.10) || (g >= r * 0.95 && g >= b * 1.02 && g >= 0.12)
}

function mediana(arr: number[]): number {
  if (arr.length === 0) return 0
  const copia = [...arr].sort((a, b) => a - b)
  const mitad = Math.floor(copia.length / 2)
  return copia.length % 2 !== 0 ? copia[mitad] : (copia[mitad - 1] + copia[mitad]) / 2
}

function erosionar(m: Uint8Array, n: number, veces: number): Uint8Array {
  let a = m
  for (let t = 0; t < veces; t++) {
    const b = new Uint8Array(n * n)
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x
        if (a[i] && a[i - 1] && a[i + 1] && a[i - n] && a[i + n]) {
          b[i] = 1
        }
      }
    }
    a = b
  }
  return a
}

function dilatar8(m: Uint8Array, n: number, veces = 1): Uint8Array {
  let a = m
  for (let t = 0; t < veces; t++) {
    const b = new Uint8Array(a)
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (a[y * n + x]) continue
        let hay = false
        for (let dy = -1; dy <= 1 && !hay; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= n) continue
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            if (xx >= 0 && xx < n && a[yy * n + xx]) { hay = true; break }
          }
        }
        if (hay) b[y * n + x] = 1
      }
    }
    a = b
  }
  return a
}

function erosionar8(m: Uint8Array, n: number, veces = 1): Uint8Array {
  let a = m
  for (let t = 0; t < veces; t++) {
    const b = new Uint8Array(n * n)
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!a[y * n + x]) continue
        let todos = true
        for (let dy = -1; dy <= 1 && todos; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= n) { todos = false; break }
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            if (xx < 0 || xx >= n || !a[yy * n + xx]) { todos = false; break }
          }
        }
        if (todos) b[y * n + x] = 1
      }
    }
    a = b
  }
  return a
}

function cierreYDilatacion(m: Uint8Array, n: number, silueta: Uint8Array): Uint8Array {
  const dil = dilatar8(m, n, 1)
  const cer = erosionar8(dil, n, 1)
  const dil2 = dilatar8(cer, n, 1)
  const out = new Uint8Array(n * n)
  for (let i = 0; i < n * n; i++) {
    if (dil2[i] && silueta[i]) out[i] = 1
  }
  return out
}

function aperturaCierre(m: Uint8Array, n: number): Uint8Array {
  const er1 = erosionar(m, n, 1)
  const ap = dilatar(er1, n, 1)
  const dil = dilatar(ap, n, 1)
  return erosionar(dil, n, 1)
}

// Detecta huecos de mordedura de gusano cogollero en la hoja, sin falsos positivos.
export function huecosMordedura(
  mascara: Uint8Array | null,
  rgb?: Float32Array | null,
  lado = LADO_HUECOS
): ResultadoHuecos {
  if (!mascara) return { cantidad: 0, fraccion: 0, fuerte: false }
  let tieneHoja = false
  for (let i = 0; i < mascara.length; i++) if (mascara[i]) { tieneHoja = true; break }
  if (!tieneHoja) return { cantidad: 0, fraccion: 0, fuerte: false }

  const nMask = Math.round(Math.sqrt(mascara.length))
  const llenaOrig = rellenar(mascara, nMask)

  let n = nMask
  let siluetaEval = llenaOrig
  let huecosRaw: Uint8Array
  let areaHoja = 0

  if (!rgb) {
    for (let i = 0; i < n * n; i++) if (llenaOrig[i]) areaHoja++
    if (areaHoja <= 0) return { cantidad: 0, fraccion: 0, fuerte: false }
    huecosRaw = new Uint8Array(n * n)
    let hay = false
    for (let i = 0; i < n * n; i++) {
      if (llenaOrig[i] && !mascara[i]) { huecosRaw[i] = 1; hay = true }
    }
    if (!hay) return { cantidad: 0, fraccion: 0, fuerte: false }
  } else {
    n = lado
    const sil512 = new Uint8Array(n * n)
    for (let y = 0; y < n; y++) {
      const sy = Math.floor((y * nMask) / n)
      for (let x = 0; x < n; x++) {
        const sx = Math.floor((x * nMask) / n)
        sil512[y * n + x] = llenaOrig[sy * nMask + sx]
      }
    }
    siluetaEval = rellenar(sil512, n)
    for (let i = 0; i < n * n; i++) if (siluetaEval[i]) areaHoja++
    if (areaHoja < 100) return { cantidad: 0, fraccion: 0, fuerte: false }

    const labs = new Float32Array(n * n * 3)
    const hsvs = new Float32Array(n * n * 3)
    const tejidos = new Uint8Array(n * n)
    const verdes = new Uint8Array(n * n)
    const nPix = n * n

    for (let i = 0; i < nPix; i++) {
      const r = rgb[i], g = rgb[nPix + i], b = rgb[2 * nPix + i]
      const [L, A, B] = rgbALab(r, g, b)
      const [H, S, V] = rgbAHsv(r, g, b)
      labs[3 * i] = L; labs[3 * i + 1] = A; labs[3 * i + 2] = B
      hsvs[3 * i] = H; hsvs[3 * i + 1] = S; hsvs[3 * i + 2] = V
      if (esTejidoHoja(r, g, b, H, S, V)) tejidos[i] = 1
      if (esVerde(r, g, b, H, S, V)) verdes[i] = 1
    }

    const iterErosion = Math.max(3, Math.round(0.025 * n))
    let interior = erosionar(siluetaEval, n, iterErosion)
    let sumaInt = 0
    for (let i = 0; i < nPix; i++) if (interior[i]) sumaInt++
    if (sumaInt < 200) {
      interior = erosionar(siluetaEval, n, Math.max(1, (iterErosion / 2) | 0))
      sumaInt = 0
      for (let i = 0; i < nPix; i++) if (interior[i]) sumaInt++
    }
    if (sumaInt < 50) interior = siluetaEval

    const selL: number[] = [], selA: number[] = [], selB: number[] = []
    for (let i = 0; i < nPix; i++) {
      if (interior[i] && verdes[i]) {
        selL.push(labs[3 * i]); selA.push(labs[3 * i + 1]); selB.push(labs[3 * i + 2])
      }
    }
    if (selL.length < 200) {
      selL.length = 0; selA.length = 0; selB.length = 0
      for (let i = 0; i < nPix; i++) {
        if (interior[i] && tejidos[i]) {
          selL.push(labs[3 * i]); selA.push(labs[3 * i + 1]); selB.push(labs[3 * i + 2])
        }
      }
    }
    if (selL.length < 100) {
      selL.length = 0; selA.length = 0; selB.length = 0
      for (let i = 0; i < nPix; i++) {
        if (interior[i]) {
          selL.push(labs[3 * i]); selA.push(labs[3 * i + 1]); selB.push(labs[3 * i + 2])
        }
      }
    }
    if (selL.length < 50) {
      selL.length = 0; selA.length = 0; selB.length = 0
      for (let i = 0; i < nPix; i++) {
        if (siluetaEval[i]) {
          selL.push(labs[3 * i]); selA.push(labs[3 * i + 1]); selB.push(labs[3 * i + 2])
        }
      }
    }

    const medL = mediana(selL), medA = mediana(selA), medB = mediana(selB)
    const madL = mediana(selL.map((v) => Math.abs(v - medL)))
    const madA = mediana(selA.map((v) => Math.abs(v - medA)))
    const madB = mediana(selB.map((v) => Math.abs(v - medB)))
    const sigL = Math.max(1.4826 * madL, 4.0)

    // (a) Candidatos por color dentro de la silueta:
    // Claramente más oscuro que el tejido (L < med_L - 3*sig_L) o fuera de verde-amarillo con baja saturación
    const huecosColor = new Uint8Array(nPix)
    for (let i = 0; i < nPix; i++) {
      if (siluetaEval[i] && !tejidos[i]) {
        const esOscuro = labs[3 * i] < (medL - 3.0 * sigL)
        const H = hsvs[3 * i]
        const S = hsvs[3 * i + 1]
        const fueraVerdeAmarillo = (H < 35.0 || H > 175.0)
        const satBaja = S < 0.35
        if (esOscuro || (fueraVerdeAmarillo && satBaja)) {
          huecosColor[i] = 1
        }
      }
    }

    // (b) Cierre y ligera dilatación morfológica (3x3) para recuperar el hueco completo
    const huecosRecuperados = cierreYDilatacion(huecosColor, n, siluetaEval)

    // Incluir también huecos geométricos de la máscara original si los tuviera
    huecosRaw = new Uint8Array(huecosRecuperados)
    for (let y = 0; y < n; y++) {
      const sy = Math.floor((y * nMask) / n)
      for (let x = 0; x < n; x++) {
        const sx = Math.floor((x * nMask) / n)
        const idxOrig = sy * nMask + sx
        if (llenaOrig[idxOrig] && !mascara[idxOrig]) {
          huecosRaw[y * n + x] = 1
        }
      }
    }
  }

  const huecosLimpios = !rgb ? aperturaCierre(huecosRaw, n) : huecosRaw

  // Dilatación del contorno exterior (2 % del lado) para descartar huecos pegados al borde
  const exterior = new Uint8Array(n * n)
  for (let i = 0; i < n * n; i++) exterior[i] = siluetaEval[i] ? 0 : 1
  for (let x = 0; x < n; x++) {
    exterior[x] = 1
    exterior[(n - 1) * n + x] = 1
    exterior[x * n] = 1
    exterior[x * n + n - 1] = 1
  }
  const vecesBorde = Math.max(1, Math.round(UMBRAL_HUECO_BORDE_PCT * n))
  const zonaBorde = dilatar(exterior, n, vecesBorde)

  const { et, areas } = etiquetar(huecosLimpios, n)
  if (!areas.length) return { cantidad: 0, fraccion: 0, fuerte: false }

  const compsPuntos: Punto[][] = Array.from({ length: areas.length }, () => [])
  const compsBorde: boolean[] = new Array(areas.length).fill(false)
  const minX = new Int32Array(areas.length).fill(n)
  const maxX = new Int32Array(areas.length).fill(-1)
  const minY = new Int32Array(areas.length).fill(n)
  const maxY = new Int32Array(areas.length).fill(-1)

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const idx = y * n + x
      const e = et[idx]
      if (e > 0) {
        const k = e - 1
        compsPuntos[k].push([x, y])
        if (zonaBorde[idx]) compsBorde[k] = true
        if (x < minX[k]) minX[k] = x
        if (x > maxX[k]) maxX[k] = x
        if (y < minY[k]) minY[k] = y
        if (y > maxY[k]) maxY[k] = y
      }
    }
  }

  let cantidad = 0, areaTotal = 0
  for (let k = 0; k < areas.length; k++) {
    const areaComp = areas[k]
    // 1. Ignorar componentes muy pequeños (ruido, < 0.04 % del área de la hoja)
    if (areaComp < UMBRAL_HUECO_RUIDO_FRAC * areaHoja) continue
    // 2. Ignorar regiones pegadas al contorno exterior o al borde de la imagen
    if (compsBorde[k]) continue
    // 3. Ignorar componentes muy alargados y delgados (relación de aspecto > 6)
    const anchoBB = maxX[k] - minX[k] + 1
    const altoBB = maxY[k] - minY[k] + 1
    const relacionAspecto = Math.max(anchoBB, altoBB) / Math.max(1, Math.min(anchoBB, altoBB))
    if (relacionAspecto > UMBRAL_HUECO_ASPECTO_MAX) continue

    // 3b. Descarta manchas alargadas de tizón (relación de aspecto > 3.5 con tono marrón claro)
    if (relacionAspecto > 3.5 && rgb) {
      const ptsK = compsPuntos[k]
      const nComp = ptsK.length
      let sumH = 0, sumS = 0, sumL = 0, sumR = 0, sumG = 0, sumB = 0
      for (let pIdx = 0; pIdx < nComp; pIdx++) {
        const [px, py] = ptsK[pIdx]
        const idxPix = py * n + px
        sumH += hsvs[3 * idxPix]
        sumS += hsvs[3 * idxPix + 1]
        sumL += labs[3 * idxPix]
        sumR += rgb[idxPix]
        sumG += rgb[nPix + idxPix]
        sumB += rgb[2 * nPix + idxPix]
      }
      const hMed = sumH / nComp, sMed = sumS / nComp, lMed = sumL / nComp
      const rMed = sumR / nComp, gMed = sumG / nComp, bMed = sumB / nComp
      const esMarronClaro = (
        hMed >= 10.0 && hMed <= 50.0 &&
        sMed >= 0.10 &&
        lMed >= 25.0 &&
        rMed >= gMed * 0.90 &&
        rMed > bMed
      )
      if (esMarronClaro) continue
    }

    // 4. Ignorar componentes no convexos / hendiduras (solidez < 0.4)
    const pts = compsPuntos[k]
    if (pts.length < 3) continue
    const ac = areaCasco(pts)
    const sol = ac > 1e-6 ? areaComp / ac : 0
    if (sol < UMBRAL_HUECO_SOLIDEZ_MIN) continue

    cantidad++
    areaTotal += areaComp
  }

  const fraccion = areaHoja > 0 ? areaTotal / areaHoja : 0
  const fuerte = (cantidad >= HUECOS_FUERTE_MIN_CANTIDAD && fraccion >= HUECOS_FUERTE_MIN_FRACCION) ||
                 (cantidad >= HUECOS_FUERTE_MODERADO_CANTIDAD && fraccion >= HUECOS_FUERTE_MODERADO_FRACCION)

  return { cantidad, fraccion: redondea(fraccion), fuerte }
}

// ---- mapa de calor ----
export const LADO_CALOR = 96
const PUNTOS = [0, 0.25, 0.5, 0.75, 1]
const COLORES = [[0, 0, 255], [0, 255, 255], [0, 255, 0], [255, 255, 0], [255, 0, 0]]

// Redimensión bilineal (centros de píxel, como PIL al ampliar).
function ampliar(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  const out = new Float32Array(dw * dh)
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(sh - 1, Math.max(0, ((y + 0.5) * sh) / dh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(sw - 1, Math.max(0, ((x + 0.5) * sw) / dw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0
      const a = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx, b = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx
      out[y * dw + x] = a * (1 - ty) + b * ty
    }
  }
  return out
}

function normalizar(c: Float32Array): Float32Array {
  let mn = Infinity, mx = -Infinity
  const v = c.map((x) => Math.max(0, x))
  for (const x of v) { if (x < mn) mn = x; if (x > mx) mx = x }
  const r = mx - mn
  return r > 1e-8 ? v.map((x) => (x - mn) / r) : new Float32Array(v.length)
}

// Máscara al tamaño del mapa, un poco ampliada y con borde difuminado: no corta lesiones del borde.
function mascaraSuave(m: Uint8Array, n: number, t: number): Float32Array {
  const f = new Float32Array(n * n)
  for (let i = 0; i < n * n; i++) f[i] = m[i]
  let v = ampliar(f, n, n, t, t)
  const filtro = (a: Float32Array, op: 'max' | 'media') => {
    const o = new Float32Array(t * t)
    for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) {
      let acc = op === 'max' ? 0 : 0, k = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const val = a[Math.min(t - 1, Math.max(0, y + dy)) * t + Math.min(t - 1, Math.max(0, x + dx))]
        if (op === 'max') acc = Math.max(acc, val); else { acc += val; k++ }
      }
      o[y * t + x] = op === 'max' ? acc : acc / k
    }
    return o
  }
  v = filtro(filtro(filtro(v, 'max'), 'media'), 'media')
  return v
}

// cam: [K, h, w] de la salida "cam"; k: índice de la clase elegida. mascara (192×192) opcional: si viene, el color solo cubre la hoja.
export function mapaCalor(cam: Float32Array, k: number, h: number, w: number, mascara?: Uint8Array | null): string {
  const t = LADO_CALOR
  let v = ampliar(normalizar(cam.subarray(k * h * w, (k + 1) * h * w)), w, h, t, t)
  if (mascara) {
    const ms = mascaraSuave(mascara, LADO, t)
    v = v.map((x, i) => x * ms[i])
    const mx = v.reduce((a, b) => Math.max(a, b), 0)
    if (mx > 1e-6) v = v.map((x) => x / mx) // la zona más mirada dentro de la hoja queda en rojo
  }
  const rgba = new Uint8Array(t * t * 4)
  for (let i = 0; i < t * t; i++) {
    const x = v[i]
    let j = 0
    while (j < 3 && x > PUNTOS[j + 1]) j++
    const f = (x - PUNTOS[j]) / (PUNTOS[j + 1] - PUNTOS[j])
    for (let c = 0; c < 3; c++) rgba[4 * i + c] = Math.round(COLORES[j][c] + (COLORES[j + 1][c] - COLORES[j][c]) * Math.min(1, Math.max(0, f)))
    rgba[4 * i + 3] = Math.round(Math.min(0.75, Math.max(0, x * 1.2 - 0.15)) * 255)
  }
  return pngBase64(rgba, t, t)
}

// Qué parte de la atención del modelo cae dentro de la hoja ubicada (0–1). Si es baja, no se recorta ni se dibuja contorno.
export const ATENCION_MIN_DENTRO = 0.4
export function fraccionDentro(cam: Float32Array, k: number, h: number, w: number, mascara: Uint8Array): number {
  const v = ampliar(normalizar(cam.subarray(k * h * w, (k + 1) * h * w)), w, h, LADO, LADO)
  let total = 0, dentro = 0
  for (let i = 0; i < v.length; i++) { total += v[i]; if (mascara[i]) dentro += v[i] }
  return total > 1e-8 ? dentro / total : 0
}
