// Seguimiento de parcelas en el teléfono: registrar parcela, anotar visitas y ver si mejora con el tratamiento.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTema } from './tema'
import { CULTIVOS, esSana, infoClase } from './catalogo'
import type { Resultado } from './ia'
import {
  Parcela,
  SEVERIDAD,
  TENDENCIA,
  Visita,
  agregarDiagnosticoAParcela,
  agregarVisita,
  borrarParcela,
  borrarVisita,
  crearParcela,
  listarParcelas,
  quitarDiagnosticoDeParcela,
  tendencia,
  visitas,
} from './parcelas'
import { Fila, asignarParcela, listar as listarHistorial, obtenerDiagnostico } from './historial'
import { agregarDiagnosticoAParcelaRemota, enLinea, quitarDiagnosticoDeParcelaRemota } from './servidor'
import { cuentaActual } from './cuenta'

const fecha = (f: string) => new Date(f).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })

export default function Parcelas() {
  const [abierta, setAbierta] = useState<Parcela | null>(null)
  return abierta ? <Detalle p={abierta} volver={() => setAbierta(null)} /> : <Lista abrir={setAbierta} />
}

function Lista({ abrir }: { abrir: (p: Parcela) => void }) {
  const { colores: C } = useTema()
  const [items, setItems] = useState<Parcela[]>([])
  const [nombre, setNombre] = useState('')
  const [cultivo, setCultivo] = useState('cafe')
  const [lugar, setLugar] = useState('')

  // Búsqueda y filtros
  const [busqueda, setBusqueda] = useState('')
  const [filtroCultivo, setFiltroCultivo] = useState('todos')
  const [soloAlertas, setSoloAlertas] = useState(false)

  const cargar = useCallback(() => {
    try {
      setItems(listarParcelas())
    } catch {
      setItems([])
    }
  }, [])
  useEffect(cargar, [cargar])

  const crear = () => {
    if (nombre.trim().length < 2) return
    try {
      crearParcela(nombre, cultivo, lugar)
    } catch {}
    setNombre('')
    setLugar('')
    cargar()
  }

  // Filtrado optimizado con useMemo
  const parcelasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return items.filter((p) => {
      // Filtro por cultivo
      if (filtroCultivo !== 'todos' && p.cultivo !== filtroCultivo) return false

      // Búsqueda por texto (nombre, lugar o cultivo)
      if (q) {
        const nom = (p.nombre ?? '').toLowerCase()
        const lug = (p.lugar ?? '').toLowerCase()
        const cult = (CULTIVOS[p.cultivo]?.nombre ?? p.cultivo ?? '').toLowerCase()
        if (!nom.includes(q) && !lug.includes(q) && !cult.includes(q)) return false
      }

      // Filtro por alertas (severidad >= 2)
      if (soloAlertas) {
        try {
          const v = visitas(p.id)
          const ult = v[v.length - 1]
          if (!ult || ult.severidad < 2) return false
        } catch {
          return false
        }
      }

      return true
    })
  }, [items, busqueda, filtroCultivo, soloAlertas])

  const hayFiltros = busqueda.trim() !== '' || filtroCultivo !== 'todos' || soloAlertas
  const quitarFiltros = () => {
    setBusqueda('')
    setFiltroCultivo('todos')
    setSoloAlertas(false)
  }

  return (
    <ScrollView contentContainerStyle={s.contenido}>
      {/* Barra de búsqueda por texto */}
      <View style={[s.cajaBusqueda, { backgroundColor: C.fondo2, borderColor: C.borde2 }]}>
        <Text style={{ fontSize: 16 }}>🔍</Text>
        <TextInput
          style={[s.inputBusqueda, { color: C.texto }]}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar parcela por nombre, lugar o cultivo…"
          placeholderTextColor={C.tenue}
          autoCapitalize="none"
        />
        {busqueda.length > 0 && (
          <Pressable onPress={() => setBusqueda('')} hitSlop={8} style={{ padding: 4 }}>
            <Text style={{ color: C.tenue, fontSize: 14, fontWeight: '700' }}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* Chips de filtro por cultivo y alertas */}
      <View style={{ gap: 6 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filaChips}>
          <Pressable
            onPress={() => setFiltroCultivo('todos')}
            style={[s.chipFiltro, { borderColor: C.borde2, backgroundColor: C.fondo2 }, filtroCultivo === 'todos' && { borderColor: C.acento, backgroundColor: C.acento + '22' }]}
          >
            <Text style={[s.chipFiltroTxt, { color: filtroCultivo === 'todos' ? C.acento : C.texto }]}>Todos</Text>
          </Pressable>
          {Object.entries(CULTIVOS).map(([k, c]) => {
            const sel = filtroCultivo === k
            return (
              <Pressable
                key={k}
                onPress={() => setFiltroCultivo(k)}
                style={[s.chipFiltro, { borderColor: C.borde2, backgroundColor: C.fondo2 }, sel && { borderColor: c.color, backgroundColor: c.color + '22' }]}
              >
                <Text style={[s.chipFiltroTxt, { color: sel ? c.color : C.texto }]}>{c.nombre}</Text>
              </Pressable>
            )
          })}
          <Pressable
            onPress={() => setSoloAlertas(!soloAlertas)}
            style={[s.chipFiltro, { borderColor: C.borde2, backgroundColor: C.fondo2 }, soloAlertas && { borderColor: C.coral, backgroundColor: C.coral + '22' }]}
          >
            <Text style={[s.chipFiltroTxt, { color: soloAlertas ? C.coral : C.tenue }]}>⚠️ Solo alertas</Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Contador de resultados y Quitar filtros */}
      <View style={s.contadorFila}>
        <Text style={[s.contadorTxt, { color: C.tenue }]}>
          {items.length === 0
            ? '0 parcelas'
            : parcelasFiltradas.length === items.length
            ? `${items.length} ${items.length === 1 ? 'parcela' : 'parcelas'}`
            : `${parcelasFiltradas.length} de ${items.length} parcelas`}
        </Text>
        {hayFiltros && (
          <Pressable onPress={quitarFiltros} hitSlop={8}>
            <Text style={{ color: C.acento, fontSize: 13, fontWeight: '700' }}>Quitar filtros</Text>
          </Pressable>
        )}
      </View>

      {/* Lista de parcelas filtradas */}
      {parcelasFiltradas.map((p) => {
        let v: Visita[] = []
        try {
          v = visitas(p.id)
        } catch {
          v = []
        }
        const ult = v[v.length - 1]
        return (
          <Pressable key={p.id} onPress={() => abrir(p)} style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde, borderLeftWidth: 4, borderLeftColor: CULTIVOS[p.cultivo]?.color }]}>
            <Text style={[s.titulo, { color: C.texto }]}>{p.nombre}</Text>
            <Text style={[s.tenue, { color: C.tenue }]}>{CULTIVOS[p.cultivo]?.nombre}{p.lugar ? ` · ${p.lugar}` : ''} · {v.length} visitas</Text>
            <View style={s.fila}>
              {ult ? <Sev v={ult.severidad} /> : <Text style={[s.tenue, { color: C.tenue }]}>Sin visitas</Text>}
              <Text style={[s.chip, { color: C.acento2, borderColor: C.acento2 + '55' }]}>{TENDENCIA[tendencia(v)]}</Text>
            </View>
          </Pressable>
        )
      })}

      {/* Estado vacío con filtros activos */}
      {items.length > 0 && parcelasFiltradas.length === 0 && (
        <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde, alignItems: 'center', gap: 8, paddingVertical: 24 }]}>
          <Text style={{ fontSize: 28 }}>🔍</Text>
          <Text style={[s.titulo, { color: C.texto, textAlign: 'center' }]}>No se encontraron parcelas</Text>
          <Text style={[s.tenue, { color: C.tenue, textAlign: 'center', fontSize: 13 }]}>
            Prueba ajustando la búsqueda o el filtro de cultivo.
          </Text>
          <Pressable onPress={quitarFiltros} style={[s.botonChico, { backgroundColor: C.acento }]}>
            <Text style={{ color: C.textoBotonAcento, fontWeight: '700', fontSize: 13 }}>Quitar filtros</Text>
          </Pressable>
        </View>
      )}

      {/* Formulario de nueva parcela */}
      <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
        <Text style={[s.titulo, { color: C.texto }]}>Nueva parcela</Text>
        <TextInput style={[s.entrada, { borderColor: C.borde2, color: C.texto, backgroundColor: C.fondo2 }]} value={nombre} onChangeText={setNombre} placeholder="Nombre (ej.: Cafetal La Loma)" placeholderTextColor={C.tenue} maxLength={80} />
        <View style={s.fila}>
          {Object.entries(CULTIVOS).map(([k, c]) => (
            <Pressable key={k} onPress={() => setCultivo(k)} style={[s.opcion, { borderColor: C.borde2 }, cultivo === k && { borderColor: c.color, backgroundColor: c.color + '22' }]}>
              <Text style={{ color: c.color, fontWeight: '700' }}>{c.nombre}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={[s.entrada, { borderColor: C.borde2, color: C.texto, backgroundColor: C.fondo2 }]} value={lugar} onChangeText={setLugar} placeholder="Lugar (opcional, ej.: sector Alto Mayo)" placeholderTextColor={C.tenue} maxLength={120} />
        <Pressable onPress={crear} style={[s.boton, { backgroundColor: C.acento }]}><Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>Guardar parcela</Text></Pressable>
      </View>
    </ScrollView>
  )
}

function Detalle({ p, volver }: { p: Parcela; volver: () => void }) {
  const { colores: C } = useTema()
  const [v, setV] = useState<Visita[]>([])
  const [mostrarModal, setMostrarModal] = useState(false)
  const cargar = useCallback(() => {
    try {
      setV(visitas(p.id))
    } catch {
      setV([])
    }
  }, [p.id])
  useEffect(cargar, [cargar])
  const borrar = () => Alert.alert('Borrar parcela', `¿Borrar "${p.nombre}" y sus visitas?`, [
    { text: 'Cancelar' }, { text: 'Borrar', style: 'destructive', onPress: () => { try { borrarParcela(p.id) } catch {}; volver() } }])

  const quitarDiag = async (diagId: number) => {
    try {
      quitarDiagnosticoDeParcela(p.id, diagId)
      asignarParcela(diagId, null)
      const d = obtenerDiagnostico(diagId)
      if (cuentaActual() && (await enLinea()) && d?.servidor_id) {
        await quitarDiagnosticoDeParcelaRemota(p.servidor_id || p.id, d.servidor_id).catch(() => {})
      }
    } catch {}
    cargar()
  }

  return (
    <ScrollView contentContainerStyle={s.contenido}>
      <View style={s.fila}>
        <Pressable onPress={volver} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: C.acento, fontWeight: '700' }}>‹ Mis parcelas</Text></Pressable>
        <Pressable onPress={() => setMostrarModal((prev) => !prev)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: C.acento, fontWeight: '700' }}>+ Agregar diagnósticos</Text></Pressable>
        <Pressable onPress={borrar} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: C.coral }}>Borrar</Text></Pressable>
      </View>
      {mostrarModal && (
        <ModalAgregarDiags
          parcela={p}
          onCerrar={() => setMostrarModal(false)}
          alGuardar={() => {
            setMostrarModal(false)
            cargar()
          }}
        />
      )}
      <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde, borderLeftWidth: 4, borderLeftColor: CULTIVOS[p.cultivo]?.color }]}>
        <Text style={[s.titulo, { color: C.texto }]}>{p.nombre}</Text>
        <Text style={[s.tenue, { color: C.tenue }]}>{CULTIVOS[p.cultivo]?.nombre}{p.lugar ? ` · ${p.lugar}` : ''}</Text>
        <View style={s.fila}>{v.length ? <Sev v={v[v.length - 1].severidad} /> : null}<Text style={[s.chip, { color: C.acento2, borderColor: C.acento2 + '55' }]}>{TENDENCIA[tendencia(v)]}</Text></View>
      </View>
      {v.length > 0 && (
        <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
          <Text style={[s.titulo, { color: C.texto }]}>Severidad en el tiempo</Text>
          <View style={s.grafico}>
            {v.map((x) => (
              <View key={x.id} style={s.col}>
                {x.tratamiento ? <Text style={[s.trat, { color: C.acento2 }]}>T</Text> : <Text style={s.trat}> </Text>}
                <View style={[s.pista, { backgroundColor: C.fondo2 }]}><View style={{ height: `${(x.severidad / 3) * 100}%`, minHeight: 6, backgroundColor: SEVERIDAD[x.severidad].color, borderRadius: 4 }} /></View>
                <Text style={[s.mini, { color: C.tenue }]}>{fecha(x.fecha)}</Text>
              </View>
            ))}
          </View>
          <Text style={[s.mini, { color: C.tenue }]}>Alto de la barra = severidad · T = día con tratamiento</Text>
        </View>
      )}
      <FormVisita parcela={p} alGuardar={cargar} />
      {[...v].reverse().map((x) => (
        <Pressable key={x.id} onLongPress={() => { borrarVisita(x.id); cargar() }} style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
          <View style={s.fila}><Text style={[s.texto, { color: C.texto }]}>{fecha(x.fecha)}</Text><Sev v={x.severidad} /></View>
          {x.clase && <Text style={[s.tenue, { color: C.tenue }]}>IA: {infoClase(x.clase).nombre}{x.confianza != null ? ` (${Math.round(x.confianza * 100)} %)` : ''}</Text>}
          {x.tratamiento && <Text style={[s.texto, { color: C.texto, fontWeight: '700' }]}>Tratamiento: {x.tratamiento}</Text>}
          {x.nota && <Text style={[s.tenue, { color: C.tenue }]}>{x.nota}</Text>}
          {x.diagnostico_id != null && (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 }}>
              <Pressable
                onPress={() => quitarDiag(x.diagnostico_id!)}
                style={[s.botonQuitar, { borderColor: C.coral + '77', backgroundColor: C.coral + '15' }]}
                hitSlop={8}
              >
                <Text style={{ color: C.coral, fontWeight: '700', fontSize: 13 }}>Quitar de la parcela</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      ))}
      {v.length > 0 && <Text style={[s.mini, { color: C.tenue, textAlign: 'center' }]}>Mantén presionada una visita para borrarla.</Text>}
    </ScrollView>
  )
}

function ModalAgregarDiags({
  parcela,
  onCerrar,
  alGuardar,
}: {
  parcela: Parcela
  onCerrar: () => void
  alGuardar: () => void
}) {
  const { colores: C } = useTema()
  const [busqueda, setBusqueda] = useState('')
  const [seleccionados, setSeleccionados] = useState<number[]>([])
  const [guardando, setGuardando] = useState(false)

  const diagsDisponibles = useMemo(() => {
    try {
      const todas = listarHistorial()
      const v = visitas(parcela.id)
      const idsEnVisita = new Set(v.map((x) => x.diagnostico_id).filter(Boolean))
      return todas.filter(
        (d) => d.parcela_id !== parcela.id && !idsEnVisita.has(d.id)
      )
    } catch {
      return []
    }
  }, [parcela.id])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return diagsDisponibles
    return diagsDisponibles.filter((d) => {
      const enf = d.clase ? infoClase(d.clase, d.etiqueta).nombre.toLowerCase() : 'no concluyente'
      const cult = (CULTIVOS[d.cultivo ?? '']?.nombre ?? d.cultivo ?? '').toLowerCase()
      const prov = (d.provincia ?? '').toLowerCase()
      return enf.includes(q) || cult.includes(q) || prov.includes(q)
    })
  }, [diagsDisponibles, busqueda])

  const alternar = (id: number) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const guardar = async () => {
    if (seleccionados.length === 0) return
    setGuardando(true)
    for (const id of seleccionados) {
      try {
        const d = diagsDisponibles.find((x) => x.id === id)
        if (!d) continue
        asignarParcela(d.id, parcela.id)
        agregarDiagnosticoAParcela(parcela.id, d.id, d, d.foto)
        if (cuentaActual() && (await enLinea()) && d.servidor_id) {
          await agregarDiagnosticoAParcelaRemota(
            parcela.servidor_id || parcela.id,
            d.servidor_id
          ).catch(() => {})
        }
      } catch {}
    }
    setGuardando(false)
    alGuardar()
  }

  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.acento, borderWidth: 2, gap: 10 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[s.titulo, { color: C.texto }]}>Agregar diagnósticos</Text>
        <Pressable onPress={onCerrar} hitSlop={8}><Text style={{ color: C.tenue, fontWeight: '700', fontSize: 16 }}>✕</Text></Pressable>
      </View>
      <Text style={[s.tenue, { color: C.tenue }]}>
        Elige diagnósticos de tu historial para vincularlos a {parcela.nombre}.
      </Text>

      <TextInput
        style={[s.entrada, { borderColor: C.borde2, color: C.texto, backgroundColor: C.fondo2 }]}
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar por enfermedad o cultivo…"
        placeholderTextColor={C.tenue}
      />

      {filtrados.length === 0 ? (
        <Text style={[s.tenue, { color: C.tenue, textAlign: 'center', paddingVertical: 12 }]}>
          {diagsDisponibles.length === 0 ? 'No tienes diagnósticos disponibles para agregar.' : 'No hay resultados con esa búsqueda.'}
        </Text>
      ) : (
        <View style={{ maxHeight: 220, gap: 6 }}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
            {filtrados.map((d) => {
              const sel = seleccionados.includes(d.id)
              return (
                <Pressable
                  key={d.id}
                  onPress={() => alternar(d.id)}
                  style={[
                    s.filaDiagItem,
                    {
                      backgroundColor: sel ? C.acento + '18' : C.fondo2,
                      borderColor: sel ? C.acento : C.borde2,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 16 }}>{sel ? '☑' : '☐'}</Text>
                  {d.foto ? <Image source={{ uri: d.foto }} style={{ width: 36, height: 36, borderRadius: 6 }} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.texto, { color: C.texto, fontWeight: '700' }]}>
                      {d.clase ? infoClase(d.clase, d.etiqueta).nombre : 'No concluyente'}
                    </Text>
                    <Text style={[s.mini, { color: C.tenue }]}>
                      {CULTIVOS[d.cultivo ?? '']?.nombre ?? '—'} · {fecha(d.fecha)}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      )}

      <View style={s.fila}>
        <Pressable
          onPress={guardar}
          disabled={seleccionados.length === 0 || guardando}
          style={[
            s.boton,
            { backgroundColor: C.acento },
            (seleccionados.length === 0 || guardando) && { opacity: 0.5 },
          ]}
        >
          <Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>
            {guardando ? 'Guardando…' : `Agregar (${seleccionados.length})`}
          </Text>
        </Pressable>
        <Pressable onPress={onCerrar} style={[s.boton, { backgroundColor: C.fondo2, borderColor: C.borde2, borderWidth: 1 }]}>
          <Text style={[s.botonTxt, { color: C.texto }]}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  )
}

export function FormVisita({ parcela, alGuardar, resultado, foto }: { parcela: Parcela; alGuardar: () => void; resultado?: Resultado | null; foto?: string | null }) {
  const { colores: C } = useTema()
  const sana = resultado?.estado === 'diagnostico' && !!resultado.clase && esSana(resultado.clase)
  const [sev, setSev] = useState<number | null>(sana ? 0 : null)
  const [trat, setTrat] = useState('')
  const [nota, setNota] = useState('')
  const guardar = () => { if (sev == null) return; agregarVisita(parcela.id, sev, trat, nota, resultado, foto); setSev(null); setTrat(''); setNota(''); alGuardar() }
  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
      <Text style={[s.titulo, { color: C.texto }]}>Nueva visita</Text>
      <Text style={[s.tenue, { color: C.tenue }]}>¿Cuánto daño ves en la parcela?</Text>
      {SEVERIDAD.map((x, i) => (
        <Pressable key={i} onPress={() => setSev(i)} style={[s.opcionSev, { borderColor: C.borde, backgroundColor: C.fondo2 }, sev === i && { borderColor: x.color, backgroundColor: x.color + '22' }]}>
          <View style={[s.punto, { backgroundColor: x.color }]} /><Text style={[s.texto, { color: C.texto, fontWeight: '700', flex: 1 }]}>{x.nombre}</Text><Text style={[s.mini, { color: C.tenue }]}>{x.detalle}</Text>
        </Pressable>
      ))}
      <TextInput style={[s.entrada, { borderColor: C.borde2, color: C.texto, backgroundColor: C.fondo2 }]} value={trat} onChangeText={setTrat} placeholder="Tratamiento aplicado hoy (opcional)" placeholderTextColor={C.tenue} maxLength={300} />
      <TextInput style={[s.entrada, { borderColor: C.borde2, color: C.texto, backgroundColor: C.fondo2 }]} value={nota} onChangeText={setNota} placeholder="Nota (opcional)" placeholderTextColor={C.tenue} maxLength={500} />
      <Pressable onPress={guardar} disabled={sev == null} style={[s.boton, { backgroundColor: C.acento }, sev == null && { opacity: 0.5 }]}><Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>Guardar visita</Text></Pressable>
    </View>
  )
}

export function AnotarEnParcela({ resultado, foto }: { resultado: Resultado; foto: string }) {
  const { colores: C } = useTema()
  const [elegida, setElegida] = useState<Parcela | null>(null)
  const [listo, setListo] = useState(false)
  if (resultado.estado === 'rechazada') return null
  let opciones: Parcela[] = []
  try {
    opciones = listarParcelas().filter((p) => !resultado.cultivo || p.cultivo === resultado.cultivo)
  } catch {
    opciones = []
  }
  if (listo) return <Text style={[s.texto, { color: C.acento }]}>Visita guardada en {elegida?.nombre}.</Text>
  if (!opciones.length) return null
  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
      <Text style={[s.titulo, { color: C.texto }]}>Anotar en una parcela</Text>
      <View style={s.fila}>
        {opciones.map((p) => (
          <Pressable key={p.id} onPress={() => setElegida(p)} style={[s.opcion, { borderColor: C.borde2 }, elegida?.id === p.id && { borderColor: C.acento, backgroundColor: C.acento + '22' }]}>
            <Text style={[s.texto, { color: C.texto }]}>{p.nombre}</Text>
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
  tarjeta: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  titulo: { fontSize: 17, fontWeight: '700' },
  texto: { fontSize: 15 },
  tenue: { fontSize: 14 },
  mini: { fontSize: 11 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '700' },
  entrada: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 48, fontSize: 15 },
  opcion: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  opcionSev: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 48 },
  punto: { width: 12, height: 12, borderRadius: 6 },
  boton: { borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  botonTxt: { fontWeight: '800', fontSize: 16 },
  grafico: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 150 },
  col: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  pista: { flex: 1, width: '70%', justifyContent: 'flex-end', borderRadius: 4 },
  trat: { fontSize: 11, fontWeight: '800' },
  cajaBusqueda: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46 },
  inputBusqueda: { flex: 1, fontSize: 14, paddingVertical: 8 },
  filaChips: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chipFiltro: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
  chipFiltroTxt: { fontSize: 12, fontWeight: '700' },
  contadorFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2, paddingBottom: 2 },
  contadorTxt: { fontSize: 13, fontWeight: '600' },
  botonChico: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 },
  botonQuitar: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  filaDiagItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
})
