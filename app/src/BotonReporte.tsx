// Reporte PDF del diagnóstico, generado en el teléfono sin internet y listo para compartir (WhatsApp, correo…).
// Mismo contenido que el reporte del servidor (api/app/reporte/pdf.py), más la "Visión de la IA" si la hubo.
import { useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { useTema } from './tema'
import { CULTIVOS, esSana, infoClase } from './catalogo'
import type { Resultado, Vision } from './ia'

const URG: Record<string, [string, string]> = {
  ninguna: ['Sin tratamiento', '#107a57'], media: ['Actuar esta semana', '#b58000'],
  alta: ['Actuar en 1 o 2 días', '#d6601a'], critica: ['Actuar hoy', '#c82828'],
}
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

async function fotoBase64(uri: string) {
  const img = await ImageManipulator.manipulate(uri).resize({ width: 900 }).renderAsync()
  const r = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true })
  return { b64: r.base64!, proporcion: r.width / r.height }
}

function html(r: Resultado, foto: { b64: string; proporcion: number }, vision: Vision | null | undefined, numero: string, fecha: string) {
  const info = infoClase(r.clase!, r.etiqueta), sana = esSana(r.clase!)
  const [urgTexto, urgColor] = URG[info.urgencia] ?? URG.media
  const color = sana ? '#107a57' : urgColor
  const conf = Math.round((r.confianza ?? 0) * 100)
  const img = `data:image/jpeg;base64,${foto.b64}`
  const contorno = (vision?.contorno ?? []).map((p) => `<polygon points="${p.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')}"/>`).join('')
  const visionHtml = vision?.calor ? `
    <div class="foto"><div class="marco" style="aspect-ratio:${foto.proporcion}">
      <img src="${img}"/><img src="data:image/png;base64,${vision.calor}" style="opacity:.75"/>
      ${contorno ? `<svg viewBox="0 0 1000 1000" preserveAspectRatio="none">${contorno}</svg>` : ''}
    </div><p class="nota">Visión de la IA: en rojo, las zonas que más pesaron en la decisión.</p></div>` : ''
  const filas = [['Confianza', `${conf} %`], ['Urgencia', urgTexto], ['Fecha', fecha], ['Ubicación', 'No indicada'], ['Origen', 'App móvil (sin internet)']]
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0 }
    * { box-sizing: border-box } body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #14211c }
    .cab { background: #107a57; color: #fff; padding: 22px 40px; display: flex; justify-content: space-between; align-items: center }
    .cab h1 { margin: 0; font-size: 30px } .cab p { margin: 4px 0 0; font-size: 14px } .der { text-align: right; font-size: 12px } .der b { font-size: 16px }
    main { padding: 26px 40px } .arriba { display: flex; gap: 24px } .fotos { width: 45%; display: flex; flex-direction: column; gap: 10px }
    .marco { position: relative; width: 100%; border-radius: 8px; overflow: hidden } .marco img, .marco svg { position: absolute; inset: 0; width: 100%; height: 100% }
    .marco svg polygon { fill: none; stroke: #22d3ee; stroke-width: 6 }
    .datos { flex: 1 } .gris { color: #646f6a } .cultivo { font-size: 12px; letter-spacing: 1px }
    h2 { margin: 6px 0 2px; font-size: 26px; color: ${color} } .agente { font-style: italic; color: #646f6a; margin: 0 0 10px }
    table { border-collapse: collapse; width: 100%; font-size: 13px } td { padding: 4px 0; vertical-align: top } td:first-child { color: #646f6a; width: 90px }
    td:last-child { font-weight: bold } .barra { height: 6px; background: #e1e8e4; border-radius: 3px; margin-top: 10px } .barra i { display: block; height: 100%; background: #107a57; border-radius: 3px }
    .hacer { border-top: 2px solid #107a57; margin-top: 24px; padding-top: 12px } .hacer h3 { color: #107a57; margin: 0 0 8px; font-size: 18px }
    .hacer p { font-size: 16px; line-height: 1.5; margin: 0 0 10px } .nota { font-size: 12px; color: #646f6a; margin: 0 }
    .firmas { position: absolute; bottom: 70px; left: 40px; right: 40px; display: flex; justify-content: space-between; font-size: 12px; color: #646f6a }
    .firmas div { width: 40%; border-top: 1px solid #646f6a; padding-top: 4px; text-align: center }
    footer { position: absolute; bottom: 24px; left: 40px; right: 40px; font-size: 10px; color: #646f6a; text-align: center }
  </style></head><body>
    <div class="cab"><div><h1>FitoLens</h1><p>Reporte de diagnóstico de enfermedades en cultivos</p></div>
      <div class="der"><b>Reporte N° ${esc(numero)}</b><br/>${esc(fecha)}</div></div>
    <main>
      <div class="arriba">
        <div class="fotos"><div class="marco" style="aspect-ratio:${foto.proporcion}"><img src="${img}"/></div>${visionHtml}</div>
        <div class="datos">
          <div class="cultivo gris">CULTIVO: ${esc((CULTIVOS[r.cultivo ?? '']?.nombre ?? r.cultivo ?? '-').toUpperCase())}</div>
          <h2>${esc(info.nombre)}</h2>${!sana && info.agente !== '—' ? `<p class="agente">${esc(info.agente)}</p>` : ''}
          <table>${filas.map(([e, v]) => `<tr><td>${e}</td><td>${esc(v)}</td></tr>`).join('')}</table>
          <div class="barra"><i style="width:${conf}%"></i></div>
        </div>
      </div>
      <div class="hacer"><h3>Qué hacer</h3><p>${esc(info.consejo)}</p>
        <p class="nota">Dosis: sigue siempre la etiqueta del producto registrado en SENASA. Usa equipo de protección y respeta el periodo de carencia antes de cosechar.</p></div>
    </main>
    <div class="firmas"><div>Agricultor</div><div>Técnico / agrónomo</div></div>
    <footer>Orientación de apoyo generada por inteligencia artificial en el teléfono; no reemplaza la visita de un agrónomo. Modelo ${esc(r.version)}.</footer>
  </body></html>`
}

export default function BotonReporte({ r, foto, vision }: { r: Resultado; foto: string; vision?: Vision | null }) {
  const { colores: C } = useTema()
  const [estado, setEstado] = useState('')
  if (r.estado !== 'diagnostico') return null

  async function compartir() {
    setEstado('Generando…')
    try {
      const ahora = new Date()
      const numero = `APP-${ahora.toISOString().slice(0, 16).replace(/\D/g, '')}`
      const fecha = ahora.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }) + ' (hora de Perú)'
      const { uri } = await Print.printToFileAsync({ html: html(r, await fotoBase64(foto), vision, numero, fecha) })
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Compartir reporte' })
      setEstado('')
    } catch (e: any) {
      setEstado(e?.message ?? 'No se pudo generar el reporte.')
    }
  }

  return (
    <>
      <Pressable onPress={compartir} disabled={estado === 'Generando…'} style={({ pressed }) => [s.boton, { backgroundColor: C.sup2, borderColor: C.borde2 }, (pressed || estado === 'Generando…') && { opacity: 0.6 }]} accessibilityRole="button">
        <Text style={[s.txt, { color: C.texto }]}>{estado === 'Generando…' ? 'Generando…' : '📄  Reporte PDF para compartir'}</Text>
      </Pressable>
      {!!estado && estado !== 'Generando…' && <Text style={{ color: C.coral, fontSize: 13, marginTop: 4 }}>{estado}</Text>}
    </>
  )
}

const s = StyleSheet.create({
  boton: { minHeight: 50, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingHorizontal: 14 },
  txt: { fontWeight: '700', fontSize: 16 },
})
