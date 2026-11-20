// Pantalla de resultado, con las mejoras de la web (web/src/paginas/Diagnostico.jsx):
// pasos "Analizando…", veredicto grande, consejos con dibujo para repetir la foto, "Tomar otra foto",
// reporte PDF y "Cómo lo decidió la IA".
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, G, Path, Rect } from 'react-native-svg'
import { C, brillo } from './tema'
import Voz from './Voz'
import BotonReporte from './BotonReporte'
import { CULTIVOS, URGENCIA, esSana, infoClase } from './catalogo'
import type { Resultado, Vision } from './ia'

// Pasos que se iluminan uno tras otro mientras la IA trabaja.
const PASOS_ESPERA = ['Preparando la foto', 'Reconociendo el cultivo', 'Buscando síntomas con el especialista', 'Calibrando la confianza', 'Marcando la zona afectada']

export function Analizando() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((x) => Math.min(x + 1, PASOS_ESPERA.length - 1)), 650)
    return () => clearInterval(id)
  }, [])
  return (
    <View style={[s.tarjeta, brillo(C.acento)]} accessibilityLiveRegion="polite">
      <Text style={s.titulo}>Analizando…</Text>
      {PASOS_ESPERA.map((p, i) => (
        <View key={p} style={s.paso}>
          {i < n ? <Text style={{ color: C.acento, width: 20, fontWeight: '800' }}>✓</Text>
            : i === n ? <ActivityIndicator size="small" color={C.acento} style={{ width: 20 }} />
              : <Text style={{ color: C.borde2, width: 20 }}>○</Text>}
          <Text style={[s.texto, { color: i <= n ? C.texto : C.tenue }]}>{p}</Text>
        </View>
      ))}
    </View>
  )
}

// Guía de portada (antes de la primera foto).
export function GuiaFoto() {
  const items = [
    ['☀️', 'Buena luz, sin sol directo', 'La sombra de un árbol o un día nublado es ideal.'],
    ['🎯', 'Una sola hoja o mazorca', 'Que ocupe casi todo el recuadro, enfocada.'],
    ['🔍', 'Que se vea el síntoma', 'Manchas, polvo, pudrición: acerca la cámara a la lesión.'],
    ['✋', 'Fondo simple', 'Si puedes, pon tu mano o un cuaderno detrás.'],
  ]
  return (
    <View style={s.tarjeta}>
      <Text style={s.sobre}>PARA UN BUEN DIAGNÓSTICO</Text>
      {items.map(([i, t, d]) => (
        <View key={t} style={s.guia}>
          <Text style={{ fontSize: 22 }}>{i}</Text>
          <View style={{ flex: 1 }}><Text style={[s.texto, { fontWeight: '700' }]}>{t}</Text><Text style={s.tenue}>{d}</Text></View>
        </View>
      ))}
    </View>
  )
}

// Consejos con dibujo para repetir la foto (no concluyente o rechazada).
function ConsejosFoto() {
  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      <Text style={[s.texto, { fontWeight: '700' }]}>Para que la IA lo vea mejor:</Text>
      {([['cerca', 'Acércate', 'La hoja debe llenar casi toda la foto.'], ['luz', 'Buena luz', 'De día, en sombra suave. Sin sol directo ni flash.'],
        ['una', 'Una sola hoja', 'O una sola mazorca, centrada y enfocada.']] as const).map(([tipo, t, d]) => (
        <View key={tipo} style={s.consejo}>
          <Dibujo tipo={tipo} />
          <View style={{ flex: 1 }}><Text style={[s.texto, { fontWeight: '700' }]}>{t}</Text><Text style={s.tenue}>{d}</Text></View>
        </View>
      ))}
    </View>
  )
}

// A la izquierda cómo NO, a la derecha cómo SÍ (mismo dibujo que la web).
function Dibujo({ tipo }: { tipo: 'cerca' | 'luz' | 'una' }) {
  const hoja = (x: number, y: number, k: number, c = '#34d399') =>
    <Path d={`M${x} ${y + 14 * k}c0-${9} ${6 * k}-${14 * k} ${15 * k}-${14 * k}c0 9-${6 * k} ${14 * k}-${15 * k} ${14 * k}z`} fill={c} />
  const mal = tipo === 'cerca' ? hoja(14, 14, 0.55)
    : tipo === 'luz' ? <>{hoja(8, 6, 1.1, '#1f5f46')}<Rect x={2} y={2} width={36} height={36} rx={5} fill="#00000088" /></>
      : <>{hoja(4, 6, 0.7)}{hoja(18, 4, 0.7)}{hoja(10, 20, 0.7)}{hoja(22, 18, 0.7)}</>
  const bien = tipo === 'luz' ? <>{hoja(8, 6, 1.1)}<Circle cx={33} cy={7} r={4} fill="#fbbf24" /></> : hoja(6, 4, 1.25)
  return (
    <Svg width={110} height={46} viewBox="0 0 96 40">
      <Rect x={2} y={2} width={36} height={36} rx={5} fill={C.fondo2} stroke={C.coral} strokeWidth={1.2} />{mal}
      <Path d="M8 34l24-28" stroke="#f87171" strokeWidth={2.5} />
      <Path d="M44 20h8m-3-3l3 3-3 3" stroke={C.tenue} strokeWidth={1.6} fill="none" />
      <G x={56}><Rect x={2} y={2} width={36} height={36} rx={5} fill={C.fondo2} stroke={C.sana} strokeWidth={1.2} />{bien}</G>
    </Svg>
  )
}

function Plegable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <View style={s.plegable}>
      <Pressable onPress={() => setAbierto(!abierto)} style={{ paddingVertical: 10 }} accessibilityRole="button" accessibilityState={{ expanded: abierto }}>
        <Text style={[s.texto, { fontWeight: '700' }]}>{abierto ? '▾' : '▸'} {titulo}</Text>
      </Pressable>
      {abierto && <View style={{ gap: 8, paddingBottom: 10 }}>{children}</View>}
    </View>
  )
}

function Pasos({ r }: { r: Resultado }) {
  if (!r.pasos?.length) return <Text style={s.tenue}>{r.ms} ms · {r.origen === 'telefono' ? 'en el teléfono, sin internet' : 'en el servidor'}</Text>
  return (
    <>
      {r.pasos.map((p) => (
        <View key={p.id} style={s.pasoIa}>
          <View style={{ flex: 1 }}><Text style={[s.texto, { fontWeight: '700' }]}>{p.titulo}</Text><Text style={s.tenue}>{p.detalle}</Text></View>
          <Text style={s.tenue}>{p.ms} ms</Text>
        </View>
      ))}
      <Text style={s.tenue}>Total: {r.ms} ms {r.origen === 'telefono' ? 'en el teléfono, sin internet' : 'en el servidor'}</Text>
    </>
  )
}

const Barra = ({ valor, color }: { valor: number; color: string }) => (
  <View style={s.barra}><View style={{ width: `${Math.round(valor * 100)}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} /></View>
)

function BotonOtra({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.otra, brillo(C.acento), pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <Text style={s.otraTxt}>📷  Tomar otra foto</Text>
    </Pressable>
  )
}

export function TarjetaResultado({ r, foto, vision, onOtra }: { r: Resultado; foto: string; vision?: Vision | null; onOtra: () => void }) {
  if (r.estado === 'rechazada') return (
    <View style={[s.tarjeta, brillo(C.coral)]}>
      <Text style={[s.sobre, { color: C.coral }]}>FOTO NO VÁLIDA</Text>
      <Text style={s.nombre}>Esta foto no es de un cultivo soportado</Text>
      <Text style={s.consejoTxt}>{r.motivo}</Text>
      <Voz r={r} />
      <ConsejosFoto />
      <BotonOtra onPress={onOtra} />
      <Plegable titulo="Cómo lo decidió la IA"><Pasos r={r} /></Plegable>
    </View>
  )

  const dudosa = r.estado === 'no_concluyente'
  const sana = !dudosa && esSana(r.clase ?? ''), info = infoClase(r.clase ?? r.top3[0]?.clase ?? '', r.clase ? r.etiqueta : r.top3[0]?.etiqueta)
  const cultivo = CULTIVOS[r.cultivo ?? ''], urg = URGENCIA[info.urgencia]
  const color = dudosa ? C.oro : sana ? C.sana : urg.color
  return (
    <View style={[s.tarjeta, brillo(color)]}>
      <View style={s.fila}>
        {cultivo && <Text style={[s.etiqueta, { color: cultivo.color, borderColor: cultivo.color + '55' }]}>{cultivo.nombre}</Text>}
        {!dudosa && <Text style={[s.etiqueta, { color, borderColor: color + '55' }]}>{urg.texto}</Text>}
      </View>
      {dudosa ? (
        <>
          <Text style={[s.sobre, { color: C.oro }]}>NO CONCLUYENTE</Text>
          <Text style={s.consejoTxt}>{r.motivo}</Text>
          <ConsejosFoto />
        </>
      ) : (
        <>
          <View style={s.veredicto}>
            <Text style={{ fontSize: 40 }}>{sana ? '✅' : '⚠️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.nombre, { color }]}>{info.nombre}</Text>
              {!sana && info.agente !== '—' && <Text style={s.cursiva}>{info.agente}</Text>}
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={[s.pct, { color }]}>{Math.round((r.confianza ?? 0) * 100)}%</Text>
              <Text style={s.tenue}>seguro</Text>
            </View>
          </View>
          <Text style={[s.sobre, { marginTop: 10 }]}>QUÉ HACER</Text>
          <Text style={s.consejoTxt}>{info.consejo}</Text>
        </>
      )}
      <Voz r={r} info={dudosa ? undefined : info} sana={sana} />
      <BotonOtra onPress={onOtra} />
      {r.estado === 'diagnostico' && <BotonReporte r={r} foto={foto} vision={vision} />}
      <Text style={[s.tenue, { marginTop: 12 }]}>{dudosa ? `Más probable: ${info.nombre}` : 'Confianza calibrada'}</Text>
      <Barra valor={r.confianza ?? 0} color={color} />
      {r.top3.length > 1 && (
        <Plegable titulo="Otras posibilidades">
          {r.top3.slice(1).map((t) => <Text key={t.clase} style={s.tenue}>{infoClase(t.clase, t.etiqueta).nombre} · {Math.round(t.confianza * 100)} %</Text>)}
        </Plegable>
      )}
      <Plegable titulo="Cómo lo decidió la IA"><Pasos r={r} /></Plegable>
      <Text style={s.pie}>Orientación de apoyo, no reemplaza la visita de un agrónomo. Dosis: sigue la etiqueta del producto registrado en SENASA. Modelo {r.version}.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  tarjeta: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.borde, borderRadius: 18, padding: 18, gap: 6 },
  sobre: { color: C.acento, fontSize: 12, fontWeight: '700', letterSpacing: 1.6 },
  titulo: { color: C.texto, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  // Letra del resultado más visible, sin exagerar (como la web: nombre ~1.7 rem, consejo ~1.05 rem).
  nombre: { color: C.texto, fontSize: 27, fontWeight: '800', lineHeight: 32 },
  pct: { fontSize: 26, fontWeight: '800' },
  consejoTxt: { color: C.texto, fontSize: 17, lineHeight: 25 },
  texto: { color: C.texto, fontSize: 15, lineHeight: 21 },
  tenue: { color: C.tenue, fontSize: 13, lineHeight: 19 },
  cursiva: { color: C.tenue, fontStyle: 'italic', fontSize: 14 },
  pie: { color: C.tenue, fontSize: 11, marginTop: 10, lineHeight: 16 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  etiqueta: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, fontSize: 13, fontWeight: '600' },
  veredicto: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  paso: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  pasoIa: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderLeftWidth: 2, borderLeftColor: C.acento2, paddingLeft: 10 },
  guia: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 4 },
  consejo: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  plegable: { borderTopWidth: 1, borderTopColor: C.borde, marginTop: 8 },
  barra: { height: 8, backgroundColor: C.fondo2, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  otra: { minHeight: 58, borderRadius: 16, backgroundColor: C.acento, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  otraTxt: { color: C.fondo, fontSize: 18, fontWeight: '800' },
})
