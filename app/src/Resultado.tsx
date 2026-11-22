// Pantalla de resultado: pasos "Analizando…", veredicto grande, consejos con dibujo para repetir la foto,
// descarga del modelo si falta, reporte PDF y "Cómo lo decidió la IA".
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, G, Path, Rect } from 'react-native-svg'
import { useTema } from './tema'
import Voz from './Voz'
import BotonReporte from './BotonReporte'
import { CULTIVOS, URGENCIA, esSana, infoClase } from './catalogo'
import type { Resultado, Vision } from './ia'
import { GRUPOS_MODELO, descargarGrupo, estaGrupoDisponible, escucharProgreso, nombreVisibleGrupo } from './gestorModelos'
import { Novedad, verificarParaDescargarModelos } from './actualizacion'
import TarjetaActualizacion from './TarjetaActualizacion'
import { enLinea, enviar } from './servidor'
import { provinciaActual } from './cuenta'

const PASOS_ESPERA = ['Preparando la foto', 'Reconociendo el cultivo', 'Buscando síntomas con el especialista', 'Calibrando la confianza', 'Marcando la zona afectada']

export function Analizando() {
  const { colores: C, brillo } = useTema()
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((x) => Math.min(x + 1, PASOS_ESPERA.length - 1)), 650)
    return () => clearInterval(id)
  }, [])
  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }, brillo(C.acento)]} accessibilityLiveRegion="polite">
      <Text style={[s.titulo, { color: C.texto }]}>Analizando…</Text>
      {PASOS_ESPERA.map((p, i) => (
        <View key={p} style={s.paso}>
          {i < n ? <Text style={{ color: C.acento, width: 22, fontWeight: '800' }}>✓</Text>
            : i === n ? <ActivityIndicator size="small" color={C.acento} style={{ width: 22 }} />
              : <Text style={{ color: C.borde2, width: 22 }}>○</Text>}
          <Text style={[s.texto, { color: i <= n ? C.texto : C.tenue }]}>{p}</Text>
        </View>
      ))}
    </View>
  )
}

export function GuiaFoto() {
  const { colores: C } = useTema()
  const items = [
    ['☀️', 'Buena luz, sin sol directo', 'La sombra de un árbol o un día nublado es ideal.'],
    ['🎯', 'Una sola hoja o mazorca', 'Que ocupe casi todo el recuadro, enfocada.'],
    ['🔍', 'Que se vea el síntoma', 'Manchas, polvo, pudrición: acerca la cámara a la lesión.'],
    ['✋', 'Fondo simple', 'Si puedes, pon tu mano o un cuaderno detrás.'],
  ]
  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
      <Text style={[s.sobre, { color: C.acento }]}>PARA UN BUEN DIAGNÓSTICO</Text>
      {items.map(([i, t, d]) => (
        <View key={t} style={s.guia}>
          <Text style={{ fontSize: 22 }}>{i}</Text>
          <View style={{ flex: 1 }}><Text style={[s.texto, { color: C.texto, fontWeight: '700' }]}>{t}</Text><Text style={[s.tenue, { color: C.tenue }]}>{d}</Text></View>
        </View>
      ))}
    </View>
  )
}

function ConsejosFoto() {
  const { colores: C } = useTema()
  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      <Text style={[s.texto, { color: C.texto, fontWeight: '700' }]}>Para que la IA lo vea mejor:</Text>
      {([['cerca', 'Acércate', 'La hoja debe llenar casi toda la foto.'], ['luz', 'Buena luz', 'De día, en sombra suave. Sin sol directo ni flash.'],
        ['una', 'Una sola hoja', 'O una sola mazorca, centrada y enfocada.']] as const).map(([tipo, t, d]) => (
        <View key={tipo} style={s.consejo}>
          <Dibujo tipo={tipo} />
          <View style={{ flex: 1 }}><Text style={[s.texto, { color: C.texto, fontWeight: '700' }]}>{t}</Text><Text style={[s.tenue, { color: C.tenue }]}>{d}</Text></View>
        </View>
      ))}
    </View>
  )
}

function Dibujo({ tipo }: { tipo: 'cerca' | 'luz' | 'una' }) {
  const { colores: C } = useTema()
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
  const { colores: C } = useTema()
  const [abierto, setAbierto] = useState(false)
  return (
    <View style={[s.plegable, { borderTopColor: C.borde }]}>
      <Pressable onPress={() => setAbierto(!abierto)} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button" accessibilityState={{ expanded: abierto }}>
        <Text style={[s.texto, { color: C.texto, fontWeight: '700' }]}>{abierto ? '▾' : '▸'} {titulo}</Text>
      </Pressable>
      {abierto && <View style={{ gap: 8, paddingBottom: 10 }}>{children}</View>}
    </View>
  )
}

function Pasos({ r }: { r: Resultado }) {
  const { colores: C } = useTema()
  if (!r.pasos?.length) return <Text style={[s.tenue, { color: C.tenue }]}>{r.ms} ms · {r.origen === 'telefono' ? 'en el teléfono, sin internet' : 'en el servidor'}</Text>
  return (
    <>
      {r.pasos.map((p) => (
        <View key={p.id} style={[s.pasoIa, { borderLeftColor: C.acento2 }]}>
          <View style={{ flex: 1 }}><Text style={[s.texto, { color: C.texto, fontWeight: '700' }]}>{p.titulo}</Text><Text style={[s.tenue, { color: C.tenue }]}>{p.detalle}</Text></View>
          <Text style={[s.tenue, { color: C.tenue }]}>{p.ms} ms</Text>
        </View>
      ))}
      <Text style={[s.tenue, { color: C.tenue }]}>Total: {r.ms} ms {r.origen === 'telefono' ? 'en el teléfono, sin internet' : 'en el servidor'}</Text>
    </>
  )
}

const Barra = ({ valor, color }: { valor: number; color: string }) => {
  const { colores: C } = useTema()
  return (
    <View style={[s.barra, { backgroundColor: C.fondo2 }]}><View style={{ width: `${Math.round(valor * 100)}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} /></View>
  )
}

function BotonOtra({ onPress }: { onPress: () => void }) {
  const { colores: C, brillo } = useTema()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.otra, { backgroundColor: C.acento }, brillo(C.acento), pressed && { opacity: 0.8 }]} accessibilityRole="button">
      <Text style={[s.otraTxt, { color: C.textoBotonAcento }]}>📷  Tomar otra foto</Text>
    </Pressable>
  )
}

export function TarjetaResultado({
  r,
  foto,
  vision,
  onOtra,
  onDiagnosticarServidor,
  onModeloDescargado,
}: {
  r: Resultado
  foto: string
  vision?: Vision | null
  onOtra: () => void
  onDiagnosticarServidor?: () => void
  onModeloDescargado?: () => void
}) {
  const { colores: C, brillo } = useTema()
  const [descargando, setDescargando] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)
  const [actualizacionReq, setActualizacionReq] = useState<Novedad | null>(null)
  const [sinInternetAviso, setSinInternetAviso] = useState<string | null>(null)
  const [servidorEnLinea, setServidorEnLinea] = useState(false)

  const grupoFaltante = r.faltaModelo ? GRUPOS_MODELO.find((g) => g.id === r.faltaModelo) : null

  useEffect(() => {
    enLinea().then(setServidorEnLinea)
  }, [])

  useEffect(() => {
    if (!r.faltaModelo) return
    return escucharProgreso((id, est) => {
      if (id === r.faltaModelo) {
        setProgreso(est.progreso)
        if (est.estado === 'listo') {
          setDescargando(false)
          onModeloDescargado?.()
        }
      }
    })
  }, [r.faltaModelo, onModeloDescargado])

  const iniciarDescarga = async () => {
    if (!r.faltaModelo) return
    setErrorDescarga(null)
    setSinInternetAviso(null)
    setActualizacionReq(null)

    // (C) Antes de descargar, verificar si la app está al día o si no hay internet
    const v = await verificarParaDescargarModelos()
    if (!v.puedeDescargar) {
      if (v.sinInternet) {
        setSinInternetAviso(v.mensaje ?? 'Sin internet no se puede descargar el modelo. Los modelos ya descargados siguen funcionando sin internet.')
        return
      }
      if (v.requiereActualizacion && v.novedad) {
        setActualizacionReq(v.novedad)
        return
      }
    }

    setDescargando(true)
    try {
      await descargarGrupo(r.faltaModelo)
      onModeloDescargado?.()
    } catch (e: any) {
      setErrorDescarga(e?.message ?? 'No se pudo descargar el modelo.')
      setDescargando(false)
    }
  }

  // Caso: Modelo especialista pendiente de descarga
  if (r.faltaModelo && grupoFaltante) {
    const cultivo = CULTIVOS[r.cultivo ?? '']
    return (
      <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }, brillo(C.oro)]}>
        <View style={s.fila}>
          {cultivo && <Text style={[s.etiqueta, { color: cultivo.color, borderColor: cultivo.color + '55' }]}>{cultivo.nombre}</Text>}
          <Text style={[s.etiqueta, { color: C.oro, borderColor: C.oro + '55' }]}>Modelo pendiente</Text>
        </View>

        <Text style={[s.sobre, { color: C.oro }]}>CULTIVO RECONOCIDO</Text>
        <Text style={[s.nombre, { color: C.texto }]}>{cultivo ? cultivo.nombre : r.cultivo}</Text>
        <Text style={[s.consejoTxt, { color: C.texto }]}>
          Reconocimos que la foto es de {cultivo?.nombre ?? r.cultivo}. Para emitir el diagnóstico de enfermedades sin internet, necesitas el modelo especialista de {nombreVisibleGrupo(r.faltaModelo)}.
        </Text>

        {/* Alerta si requiere actualizar la app antes de agregar este cultivo */}
        {actualizacionReq && (
          <TarjetaActualizacion
            novedad={actualizacionReq}
            onCerrar={() => setActualizacionReq(null)}
          />
        )}

        {/* Mensaje claro si no hay internet */}
        {sinInternetAviso && (
          <View style={[s.alertaActualizar, { backgroundColor: C.fondo2, borderColor: C.coral }]}>
            <Text style={[s.sobre, { color: C.coral }]}>SIN INTERNET</Text>
            <Text style={{ color: C.texto, fontSize: 13, lineHeight: 18 }}>{sinInternetAviso}</Text>
          </View>
        )}

        {descargando ? (
          <View style={{ gap: 6, marginVertical: 8 }}>
            <Text style={[s.tenue, { color: C.acento, fontWeight: '700' }]}>
              Descargando modelo… {Math.round(progreso * 100)} %
            </Text>
            <View style={[s.barra, { backgroundColor: C.fondo2 }]}>
              <View style={{ width: `${Math.round(progreso * 100)}%`, height: '100%', backgroundColor: C.acento }} />
            </View>
          </View>
        ) : !actualizacionReq ? (
          <Pressable
            onPress={iniciarDescarga}
            style={({ pressed }) => [s.otra, { backgroundColor: C.acento }, brillo(C.acento), pressed && { opacity: 0.8 }]}
          >
            <Text style={[s.otraTxt, { color: C.textoBotonAcento }]}>
              ⬇  Descargar modelo de {nombreVisibleGrupo(r.faltaModelo)} ({grupoFaltante.tamano_mb} MB)
            </Text>
          </Pressable>
        ) : null}

        {errorDescarga && <Text style={{ color: C.coral, fontSize: 13 }}>{errorDescarga}</Text>}

        {servidorEnLinea && onDiagnosticarServidor && (
          <Pressable
            onPress={onDiagnosticarServidor}
            style={({ pressed }) => [
              s.otra,
              { backgroundColor: C.sup, borderWidth: 1.5, borderColor: C.acento2, marginTop: 4 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[s.otraTxt, { color: C.acento2 }]}>☁  Diagnosticar en el servidor ahora</Text>
          </Pressable>
        )}

        <BotonOtra onPress={onOtra} />
        <Plegable titulo="Cómo lo decidió la IA"><Pasos r={r} /></Plegable>
      </View>
    )
  }

  if (r.estado === 'rechazada') return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }, brillo(C.coral)]}>
      <Text style={[s.sobre, { color: C.coral }]}>FOTO NO VÁLIDA</Text>
      <Text style={[s.nombre, { color: C.texto }]}>Esta foto no es de un cultivo soportado</Text>
      <Text style={[s.consejoTxt, { color: C.texto }]}>{r.motivo}</Text>
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
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }, brillo(color)]}>
      <View style={s.fila}>
        {cultivo && <Text style={[s.etiqueta, { color: cultivo.color, borderColor: cultivo.color + '55' }]}>{cultivo.nombre}</Text>}
        {!dudosa && <Text style={[s.etiqueta, { color, borderColor: color + '55' }]}>{urg.texto}</Text>}
      </View>
      {dudosa ? (
        <>
          <Text style={[s.sobre, { color: C.oro }]}>NO CONCLUYENTE</Text>
          <Text style={[s.consejoTxt, { color: C.texto }]}>{r.motivo}</Text>
          <ConsejosFoto />
        </>
      ) : (
        <>
          <View style={s.veredicto}>
            <Text style={{ fontSize: 40 }}>{sana ? '✅' : '⚠️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.nombre, { color }]}>{info.nombre}</Text>
              {!sana && info.agente !== '—' && <Text style={[s.cursiva, { color: C.tenue }]}>{info.agente}</Text>}
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={[s.pct, { color }]}>{Math.round((r.confianza ?? 0) * 100)}%</Text>
              <Text style={[s.tenue, { color: C.tenue }]}>seguro</Text>
            </View>
          </View>
          <Text style={[s.sobre, { color: C.acento, marginTop: 10 }]}>QUÉ HACER</Text>
          <Text style={[s.consejoTxt, { color: C.texto }]}>{info.consejo}</Text>
        </>
      )}
      <Voz r={r} info={dudosa ? undefined : info} sana={sana} />
      <BotonOtra onPress={onOtra} />
      {r.estado === 'diagnostico' && <BotonReporte r={r} foto={foto} vision={vision} />}
      <Text style={[s.tenue, { color: C.tenue, marginTop: 12 }]}>{dudosa ? `Más probable: ${info.nombre}` : 'Confianza calibrada'}</Text>
      <Barra valor={r.confianza ?? 0} color={color} />
      {r.top3.length > 1 && (
        <Plegable titulo="Otras posibilidades">
          {r.top3.slice(1).map((t) => <Text key={t.clase} style={[s.tenue, { color: C.tenue }]}>{infoClase(t.clase, t.etiqueta).nombre} · {Math.round(t.confianza * 100)} %</Text>)}
        </Plegable>
      )}
      <Plegable titulo="Cómo lo decidió la IA"><Pasos r={r} /></Plegable>
      <Text style={[s.pie, { color: C.tenue }]}>Orientación de apoyo, no reemplaza la visita de un agrónomo. Dosis: sigue la etiqueta del producto registrado en SENASA. Modelo {r.version}.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  tarjeta: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  sobre: { fontSize: 12, fontWeight: '700', letterSpacing: 1.6 },
  titulo: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  nombre: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  pct: { fontSize: 26, fontWeight: '800' },
  consejoTxt: { fontSize: 16, lineHeight: 24 },
  texto: { fontSize: 15, lineHeight: 21 },
  tenue: { fontSize: 13, lineHeight: 19 },
  cursiva: { fontStyle: 'italic', fontSize: 14 },
  pie: { fontSize: 11, marginTop: 10, lineHeight: 16 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  etiqueta: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, fontSize: 13, fontWeight: '600' },
  veredicto: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  paso: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  pasoIa: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderLeftWidth: 2, paddingLeft: 10 },
  guia: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 6 },
  consejo: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  plegable: { borderTopWidth: 1, marginTop: 8 },
  barra: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  otra: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingHorizontal: 14 },
  otraTxt: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  alertaActualizar: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6, marginVertical: 6 },
  alertaTexto: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
})
