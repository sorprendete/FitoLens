// Foto → tensor float32 [1, 3, H, W], RGB 0–1, redimensión directa (contrato de modelos).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { decode } from 'jpeg-js'

const base64ABytes = (b64: string) => {
  const bin = atob(b64), out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function aTensor(uri: string, alto: number, ancho: number): Promise<Float32Array> {
  const img = await ImageManipulator.manipulate(uri).resize({ width: ancho, height: alto }).renderAsync()
  const { base64 } = await img.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true })
  const { data, width, height } = decode(base64ABytes(base64!), { useTArray: true, formatAsRGBA: true })
  const n = width * height, t = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    t[i] = data[4 * i] / 255
    t[n + i] = data[4 * i + 1] / 255
    t[2 * n + i] = data[4 * i + 2] / 255
  }
  return t
}

const CLIP_MEAN = [0.48145466, 0.4578275, 0.40821073]
const CLIP_STD = [0.26862954, 0.26130258, 0.27577711]

/**
 * Preprocesado exacto para el verificador CLIP ViT-B/32:
 * 1. Redimensión del lado menor a 224 con interpolación bicúbica.
 * 2. Recorte central a 224x224.
 * 3. Normalización float32 [1, 3, 224, 224] con mean y std de CLIP.
 */
export async function aTensorVerificador(uri: string): Promise<Float32Array> {
  const refOriginal = await ImageManipulator.manipulate(uri).renderAsync()
  const w = refOriginal.width || 224
  const h = refOriginal.height || 224
  const s = 224 / Math.min(w, h)
  const wNuevo = Math.max(224, Math.round(w * s))
  const hNuevo = Math.max(224, Math.round(h * s))
  const izq = Math.max(0, Math.floor((wNuevo - 224) / 2))
  const arr = Math.max(0, Math.floor((hNuevo - 224) / 2))

  const imgTransformada = await ImageManipulator.manipulate(uri)
    .resize({ width: wNuevo, height: hNuevo })
    .crop({ originX: izq, originY: arr, width: 224, height: 224 })
    .renderAsync()

  const { base64 } = await imgTransformada.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true })
  const { data, width, height } = decode(base64ABytes(base64!), { useTArray: true, formatAsRGBA: true })

  const t = new Float32Array(3 * 224 * 224)
  const offsetCol = Math.max(0, Math.floor((width - 224) / 2))
  const offsetFila = Math.max(0, Math.floor((height - 224) / 2))
  const n = 224 * 224

  for (let y = 0; y < 224; y++) {
    for (let x = 0; x < 224; x++) {
      const idxOriginal = ((y + offsetFila) * width + (x + offsetCol)) * 4
      const idxDest = y * 224 + x
      const r = data[idxOriginal] / 255
      const g = data[idxOriginal + 1] / 255
      const b = data[idxOriginal + 2] / 255
      t[idxDest] = (r - CLIP_MEAN[0]) / CLIP_STD[0]
      t[n + idxDest] = (g - CLIP_MEAN[1]) / CLIP_STD[1]
      t[2 * n + idxDest] = (b - CLIP_MEAN[2]) / CLIP_STD[2]
    }
  }
  return t
}
