// PNG RGBA mínimo, sin librerías (bloques deflate "sin comprimir"). Solo para capas pequeñas como el mapa de calor.
const TABLA = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc(datos: Uint8Array, desde: number, hasta: number) {
  let c = 0xffffffff
  for (let i = desde; i < hasta; i++) c = TABLA[(c ^ datos[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function aBase64(b: Uint8Array) {
  let s = ''
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=')
  }
  return s
}

// rgba: ancho*alto*4 bytes. Devuelve el PNG en base64.
export function pngBase64(rgba: Uint8Array, ancho: number, alto: number): string {
  const fila = ancho * 4 + 1
  const crudo = new Uint8Array(fila * alto) // cada fila empieza con el filtro 0
  for (let y = 0; y < alto; y++) crudo.set(rgba.subarray(y * ancho * 4, (y + 1) * ancho * 4), y * fila + 1)

  // zlib: cabecera + bloques "stored" de hasta 65535 bytes + adler32
  const nBloques = Math.max(1, Math.ceil(crudo.length / 65535))
  const z = new Uint8Array(2 + crudo.length + 5 * nBloques + 4)
  z[0] = 0x78; z[1] = 0x01
  let p = 2
  for (let i = 0; i < nBloques; i++) {
    const parte = crudo.subarray(i * 65535, Math.min(crudo.length, (i + 1) * 65535))
    z[p++] = i === nBloques - 1 ? 1 : 0
    z[p++] = parte.length & 0xff; z[p++] = parte.length >> 8
    z[p++] = ~parte.length & 0xff; z[p++] = (~parte.length >> 8) & 0xff
    z.set(parte, p); p += parte.length
  }
  let a = 1, b = 0
  for (let i = 0; i < crudo.length; i++) { a = (a + crudo[i]) % 65521; b = (b + a) % 65521 }
  z[p++] = b >> 8; z[p++] = b & 0xff; z[p++] = a >> 8; z[p++] = a & 0xff

  const trozos: [string, Uint8Array][] = [
    ['IHDR', new Uint8Array([ancho >>> 24, (ancho >> 16) & 255, (ancho >> 8) & 255, ancho & 255, alto >>> 24, (alto >> 16) & 255, (alto >> 8) & 255, alto & 255, 8, 6, 0, 0, 0])],
    ['IDAT', z], ['IEND', new Uint8Array(0)],
  ]
  const total = 8 + trozos.reduce((s, [, d]) => s + 12 + d.length, 0)
  const out = new Uint8Array(total)
  out.set([137, 80, 78, 71, 13, 10, 26, 10])
  let q = 8
  for (const [tipo, d] of trozos) {
    out[q] = d.length >>> 24; out[q + 1] = (d.length >> 16) & 255; out[q + 2] = (d.length >> 8) & 255; out[q + 3] = d.length & 255
    for (let i = 0; i < 4; i++) out[q + 4 + i] = tipo.charCodeAt(i)
    out.set(d, q + 8)
    const c = crc(out, q + 4, q + 8 + d.length)
    out[q + 8 + d.length] = c >>> 24; out[q + 9 + d.length] = (c >> 16) & 255; out[q + 10 + d.length] = (c >> 8) & 255; out[q + 11 + d.length] = c & 255
    q += 12 + d.length
  }
  return aBase64(out)
}
