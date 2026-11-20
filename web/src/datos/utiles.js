import { PROVINCIAS, PROYECCION } from './provincias'

// Provincia de San Martín que contiene un punto GPS, o null si está fuera de la región.
export function provinciaDe(lat, lon) {
  const { LON0, LAT1, ESCALA } = PROYECCION
  const x = (lon - LON0) * ESCALA, y = (LAT1 - lat) * ESCALA
  const g = document.createElement('canvas').getContext('2d')
  return PROVINCIAS.find((p) => g.isPointInPath(new Path2D(p.d), x, y))?.id ?? null
}

// Reduce la foto a 1280 px de lado mayor antes de enviarla (sube rápido con poca señal).
export async function reducir(archivo, lado = 1280) {
  try {
    const bmp = await createImageBitmap(archivo)
    const f = Math.min(1, lado / Math.max(bmp.width, bmp.height))
    if (f === 1 && archivo.type === 'image/jpeg') return archivo
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))
    return b ? new File([b], 'foto.jpg', { type: 'image/jpeg' }) : archivo
  } catch { return archivo }
}

export const pct = (v) => `${Math.round((v ?? 0) * 100)} %`
export const fechaHace = (dias) => new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10)
