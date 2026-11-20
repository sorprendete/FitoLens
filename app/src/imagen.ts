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
