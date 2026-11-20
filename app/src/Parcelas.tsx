// Seguimiento de parcelas en el teléfono: registrar parcela, anotar visitas y ver si mejora con el tratamiento.
import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { C } from './tema'
import { CULTIVOS, esSana, infoClase } from './catalogo'
import type { Resultado } from './ia'
import { Parcela, SEVERIDAD, TENDENCIA, Visita, agregarVisita, borrarParcela, borrarVisita, crearParcela, listarParcelas, tendencia, visitas } from './parcelas'

const fecha = (f: string) => new Date(f).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })

export default function Parcelas() {
  const [abierta, setAbierta] = useState<Parcela | null>(null)
  return abierta ? <Detalle p={abierta} volver={() => setAbierta(null)} /> : <Lista abrir={setAbierta} />
}

function Lista({ abrir }: { abrir: (p: Parcela) => void }) {
  const [items, setItems] = useState<Parcela[]>([])
  const [nombre, setNombre] = useState('')
  const [cultivo, setCultivo] = useState('cafe')
  const [lugar, setLugar] = useState('')
  const cargar = useCallback(() => setItems(listarParcelas()), [])
  useEffect(cargar, [cargar])
  const crear = () => { if (nombre.trim().length < 2) return; crearParcela(nombre, cultivo, lugar); setNombre(''); setLugar(''); cargar() }

  return (
    <ScrollView contentContainerStyle={s.contenido}>
      {items.map((p) => {
        const v = visitas(p.id), ult = v[v.length - 1]
        return (
          <Pressable key={p.id} onPress={() => abrir(p)} style={[s.tarjeta, { borderLeftWidth: 4, borderLeftColor: CULTIVOS[p.cultivo]?.color }]}>
            <Text style={s.titulo}>{p.nombre}</Text>
            <Text style={s.tenue}>{CULTIVOS[p.cultivo]?.nombre}{p.lugar ? ` · ${p.lugar}` : ''} · {v.length} visitas</Text>
            <View style={s.fila}>
              {ult ? <Sev v={ult.severidad} /> : <Text style={s.tenue}>Sin visitas</Text>}
              <Text style={s.chip}>{TENDENCIA[tendencia(v)]}</Text>
            </View>
          </Pressable>
        )
      })}
      <View style={s.tarjeta}>
        <Text style={s.titulo}>Nueva parcela</Text>
        <TextInput style={s.entrada} value={nombre} onChangeText={setNombre} placeholder="Nombre (ej.: Cafetal La Loma)" placeholderTextColor={C.tenue} maxLength={80} />
        <View style={s.fila}>
          {Object.entries(CULTIVOS).map(([k, c]) => (
            <Pressable key={k} onPress={() => setCultivo(k)} style={[s.opcion, cultivo === k && { borderColor: c.color, backgroundColor: c.color + '22' }]}>
              <Text style={{ color: c.color, fontWeight: '700' }}>{c.nombre}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={s.entrada} value={lugar} onChangeText={setLugar} placeholder="Lugar (opcional, ej.: sector Alto Mayo)" placeholderTextColor={C.tenue} maxLength={120} />
        <Pressable onPress={crear} style={s.boton}><Text style={s.botonTxt}>Guardar parcela</Text></Pressable>
      </View>
    </ScrollView>
  )
}

function Detalle({ p, volver }: { p: Parcela; volver: () => void }) {
  const [v, setV] = useState<Visita[]>([])
  const cargar = useCallback(() => setV(visitas(p.id)), [p.id])
  useEffect(cargar, [cargar])
  const borrar = () => Alert.alert('Borrar parcela', `¿Borrar "${p.nombre}" y sus visitas?`, [
    { text: 'Cancelar' }, { text: 'Borrar', style: 'destructive', onPress: () => { borrarParcela(p.id); volver() } }])

  return (
    <ScrollView contentContainerStyle={s.contenido}>
      <View style={s.fila}>
        <Pressable onPress={volver}><Text style={{ color: C.acento, fontWeight: '700' }}>‹ Mis parcelas</Text></Pressable>
        <Pressable onPress={borrar}><Text style={{ color: C.coral }}>Borrar</Text></Pressable>
      </View>
      <View style={[s.tarjeta, { borderLeftWidth: 4, borderLeftColor: CULTIVOS[p.cultivo]?.color }]}>
        <Text style={s.titulo}>{p.nombre}</Text>
        <Text style={s.tenue}>{CULTIVOS[p.cultivo]?.nombre}{p.lugar ? ` · ${p.lugar}` : ''}</Text>
        <View style={s.fila}>{v.length ? <Sev v={v[v.length - 1].severidad} /> : null}<Text style={s.chip}>{TENDENCIA[tendencia(v)]}</Text></View>
      </View>
      {v.length > 0 && (
        <View style={s.tarjeta}>
          <Text style={s.titulo}>Severidad en el tiempo</Text>
          <View style={s.grafico}>
            {v.map((x) => (
              <View key={x.id} style={s.col}>
                {x.tratamiento ? <Text style={s.trat}>T</Text> : <Text style={s.trat}> </Text>}
                <View style={s.pista}><View style={{ height: `${(x.severidad / 3) * 100}%`, minHeight: 6, backgroundColor: SEVERIDAD[x.severidad].color, borderRadius: 4 }} /></View>
                <Text style={s.mini}>{fecha(x.fecha)}</Text>
              </View>
            ))}
          </View>
          <Text style={s.mini}>Alto de la barra = severidad · T = día con tratamiento</Text>
        </View>
      )}
      <FormVisita parcela={p} alGuardar={cargar} />
      {[...v].reverse().map((x) => (
        <Pressable key={x.id} onLongPress={() => { borrarVisita(x.id); cargar() }} style={s.tarjeta}>
          <View style={s.fila}><Text style={s.texto}>{fecha(x.fecha)}</Text><Sev v={x.severidad} /></View>
          {x.clase && <Text style={s.tenue}>IA: {infoClase(x.clase).nombre}{x.confianza != null ? ` (${Math.round(x.confianza * 100)} %)` : ''}</Text>}
          {x.tratamiento && <Text style={[s.texto, { fontWeight: '700' }]}>Tratamiento: {x.tratamiento}</Text>}
          {x.nota && <Text style={s.tenue}>{x.nota}</Text>}
        </Pressable>
      ))}
      {v.length > 0 && <Text style={[s.mini, { textAlign: 'center' }]}>Mantén presionada una visita para borrarla.</Text>}
    </ScrollView>
  )
}

// Formulario de visita. Con `resultado` y `foto` viene de un diagnóstico recién hecho.
export function FormVisita({ parcela, alGuardar, resultado, foto }: { parcela: Parcela; alGuardar: () => void; resultado?: Resultado | null; foto?: string | null }) {
  const sana = resultado?.estado === 'diagnostico' && !!resultado.clase && esSana(resultado.clase)
  const [sev, setSev] = useState<number | null>(sana ? 0 : null)
  const [trat, setTrat] = useState('')
  const [nota, setNota] = useState('')
  const guardar = () => { if (sev == null) return; agregarVisita(parcela.id, sev, trat, nota, resultado, foto); setSev(null); setTrat(''); setNota(''); alGuardar() }
  return (
    <View style={s.tarjeta}>
      <Text style={s.titulo}>Nueva visita</Text>
      <Text style={s.tenue}>¿Cuánto daño ves en la parcela?</Text>
      {SEVERIDAD.map((x, i) => (
        <Pressable key={i} onPress={() => setSev(i)} style={[s.opcionSev, sev === i && { borderColor: x.color, backgroundColor: x.color + '22' }]}>
          <View style={[s.punto, { backgroundColor: x.color }]} /><Text style={[s.texto, { fontWeight: '700', flex: 1 }]}>{x.nombre}</Text><Text style={s.mini}>{x.detalle}</Text>
        </Pressable>
      ))}
      <TextInput style={s.entrada} value={trat} onChangeText={setTrat} placeholder="Tratamiento aplicado hoy (opcional)" placeholderTextColor={C.tenue} maxLength={300} />
      <TextInput style={s.entrada} value={nota} onChangeText={setNota} placeholder="Nota (opcional)" placeholderTextColor={C.tenue} maxLength={500} />
      <Pressable onPress={guardar} disabled={sev == null} style={[s.boton, sev == null && { opacity: 0.5 }]}><Text style={s.botonTxt}>Guardar visita</Text></Pressable>
    </View>
  )
}

// Tras un diagnóstico: elegir parcela del mismo cultivo y anotar la visita.
export function AnotarEnParcela({ resultado, foto }: { resultado: Resultado; foto: string }) {
  const [elegida, setElegida] = useState<Parcela | null>(null)
  const [listo, setListo] = useState(false)
  if (resultado.estado === 'rechazada') return null
  const opciones = listarParcelas().filter((p) => !resultado.cultivo || p.cultivo === resultado.cultivo)
  if (listo) return <Text style={[s.texto, { color: C.acento }]}>Visita guardada en {elegida?.nombre}.</Text>
  if (!opciones.length) return null
  return (
    <View style={s.tarjeta}>
      <Text style={s.titulo}>Anotar en una parcela</Text>
      <View style={s.fila}>
        {opciones.map((p) => (
          <Pressable key={p.id} onPress={() => setElegida(p)} style={[s.opcion, elegida?.id === p.id && { borderColor: C.acento, backgroundColor: C.acento + '22' }]}>
            <Text style={s.texto}>{p.nombre}</Text>
          </Pressable>
        ))}
      </View>
      {elegida && <FormVisita parcela={elegida} resultado={resultado} foto={foto} alGuardar={() => setListo(true)} />}
    </View>
  )
}

const Sev = ({ v }: { v: number }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <View style={[s.punto, { backgroundColor: SEVERIDAD[v].color }]} /><Text style={[s.texto, { fontWeight: '700' }]}>{SEVERIDAD[v].nombre}</Text>
  </View>
)

const s = StyleSheet.create({
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  tarjeta: { backgroundColor: C.sup, borderColor: C.borde, borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  titulo: { color: C.texto, fontSize: 17, fontWeight: '700' },
  texto: { color: C.texto, fontSize: 15 },
  tenue: { color: C.tenue, fontSize: 14 },
  mini: { color: C.tenue, fontSize: 11 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  chip: { color: C.acento2, borderColor: C.acento2 + '55', borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, fontSize: 12, fontWeight: '700' },
  entrada: { borderColor: C.borde2, borderWidth: 1, borderRadius: 12, padding: 12, color: C.texto, fontSize: 15 },
  opcion: { borderColor: C.borde2, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  opcionSev: { flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: C.borde, borderWidth: 1, borderRadius: 12, padding: 10 },
  punto: { width: 12, height: 12, borderRadius: 6 },
  boton: { backgroundColor: C.acento, borderRadius: 14, padding: 14, alignItems: 'center' },
  botonTxt: { color: C.fondo, fontWeight: '800', fontSize: 16 },
  grafico: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 150 },
  col: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  pista: { flex: 1, width: '70%', justifyContent: 'flex-end', backgroundColor: C.fondo2, borderRadius: 4 },
  trat: { color: C.acento2, fontSize: 11, fontWeight: '800' },
})
