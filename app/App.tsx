import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as ImagePicker from 'expo-image-picker'
import { TemaProvider, useTema } from './src/tema'
import Inicio from './src/Inicio'
import Parcelas, { AnotarEnParcela } from './src/Parcelas'
import { CULTIVOS, esSana, infoClase } from './src/catalogo'
import { Resultado, Vision, diagnosticarLocal, hayIaLocal } from './src/ia'
import VisionIA from './src/VisionIA'
import { Analizando, GuiaFoto, TarjetaResultado } from './src/Resultado'
import { agregarDiagnosticoAParcelaRemota, borrarDiagnosticoRemoto, enLinea, enviar, quitarDiagnosticoDeParcelaRemota } from './src/servidor'
import { Fila, asignarParcela, borrar, guardar, listar, pendientes, sincronizar, sincronizarSola } from './src/historial'
import { agregarDiagnosticoAParcela, listarParcelas, quitarDiagnosticoDeParcela } from './src/parcelas'
import Cuenta from './src/Cuenta'
import AvisoActualizacion from './src/AvisoActualizacion'
import QueDetecta from './src/QueDetecta'
import { cargarCuenta, cuentaActual, provinciaActual } from './src/cuenta'
import { esVarianteLiviana, haCompletadoSetupInicial, useCultivosInstalados } from './src/gestorModelos'
import PantallaEleccionInicial from './src/PantallaEleccionInicial'

type Vista = 'inicio' | 'diagnosticar' | 'historial' | 'parcelas' | 'cuenta'

const PESTANAS: { id: Vista; titulo: string; icono: string }[] = [
  { id: 'inicio', titulo: 'Inicio', icono: '🏠' },
  { id: 'diagnosticar', titulo: 'Diagnóstico', icono: '📷' },
  { id: 'historial', titulo: 'Historial', icono: '📋' },
  { id: 'parcelas', titulo: 'Parcelas', icono: '🌱' },
  { id: 'cuenta', titulo: 'Cuenta', icono: '⚙️' },
]

export default function App() {
  return (
    <SafeAreaProvider>
      <TemaProvider>
        <AppContenido />
      </TemaProvider>
    </SafeAreaProvider>
  )
}

function AppContenido() {
  const { colores: C, esOscuro } = useTema()
  const [vista, setVista] = useState<Vista>('inicio')
  const [mostrarSetup, setMostrarSetup] = useState(false)

  // Cuenta opcional: sincronización en segundo plano
  useEffect(() => {
    try {
      cargarCuenta()
      return sincronizarSola()
    } catch {}
  }, [])

  // Comprobar si requiere elección inicial de cultivos (variante ligera)
  useEffect(() => {
    try {
      if (esVarianteLiviana()) {
        haCompletadoSetupInicial()
          .then((listo) => {
            if (!listo) setMostrarSetup(true)
          })
          .catch(() => {})
      }
    } catch {}
  }, [])

  return (
    <SafeAreaView style={[s.raiz, { backgroundColor: C.fondo }]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style={esOscuro ? 'light' : 'dark'} />
      <View style={[s.cabecera, { borderBottomColor: C.borde }]}>
        <Pressable onPress={() => setVista('inicio')} hitSlop={8}>
          <Text style={[s.marca, { color: C.texto }]} numberOfLines={1}>
            Fito<Text style={{ color: C.acento }}>Lens</Text>
          </Text>
        </Pressable>
        <Text style={[s.chip, { color: C.acento2, borderColor: C.acento2 + '55', backgroundColor: C.fondo2 }]} numberOfLines={1}>
          {hayIaLocal() ? '● IA en el teléfono' : '● IA en el servidor'}
        </Text>
      </View>
      <AvisoActualizacion />

      <View style={{ flex: 1 }}>
        {vista === 'inicio' ? (
          <Inicio
            onDiagnosticar={() => setVista('diagnosticar')}
            onVerHistorial={() => setVista('historial')}
            onVerParcelas={() => setVista('parcelas')}
            onGestionarCultivos={() => setVista('cuenta')}
          />
        ) : vista === 'diagnosticar' ? (
          <Diagnosticar onIrAMisCultivos={() => setVista('cuenta')} />
        ) : vista === 'historial' ? (
          <Historial />
        ) : vista === 'parcelas' ? (
          <Parcelas />
        ) : (
          <Cuenta />
        )}
      </View>

      {/* Barra de pestañas responsiva con 5 pestañas */}
      <View style={[s.pestanas, { borderTopColor: C.borde, backgroundColor: C.fondo2 }]}>
        {PESTANAS.map(({ id, titulo, icono }) => {
          const activa = vista === id
          return (
            <Pressable
              key={id}
              onPress={() => setVista(id)}
              style={[
                s.pestana,
                activa && { borderTopColor: C.acento, backgroundColor: C.sup },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: activa }}
            >
              <Text style={{ fontSize: 16 }}>{icono}</Text>
              <Text
                style={[
                  s.pestanaTxt,
                  { color: activa ? C.acento : C.tenue },
                  activa && { fontWeight: '800' },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {titulo}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {/* Pantalla modal de primera apertura (variante ligera) */}
      <PantallaEleccionInicial
        visible={mostrarSetup}
        alTerminar={() => setMostrarSetup(false)}
      />
    </SafeAreaView>
  )
}

function Diagnosticar({ onIrAMisCultivos }: { onIrAMisCultivos: () => void }) {
  const { colores: C, brillo } = useTema()
  const [foto, setFoto] = useState<string | null>(null)
  const [res, setRes] = useState<Resultado | null>(null)
  const [vision, setVision] = useState<Vision | null>(null)
  const [proporcion, setProporcion] = useState(1)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { cultivosInstalados, cultivosDisponibles, textoDetecta } = useCultivosInstalados()

  const ejecutarDiagnostico = async (uri: string, forzarServidor = false) => {
    setCargando(true)
    setError(null)
    try {
      let d: Resultado
      if (!forzarServidor && hayIaLocal()) {
        const { vision: v, ...local } = await diagnosticarLocal(uri)
        d = local
        setVision(v)
      } else if (await enLinea()) {
        d = await enviar(uri, provinciaActual())
      } else {
        throw new Error('Esta versión no trae la IA en el teléfono y no hay internet.')
      }
      guardar(uri, d)
      setRes(d)
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo diagnosticar.')
    } finally {
      setCargando(false)
    }
  }

  const elegir = async (camara: boolean) => {
    setError(null)
    const permiso = camara ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permiso.granted) return setError('Sin permiso para usar la ' + (camara ? 'cámara.' : 'galería.'))
    const op: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 }
    const r = camara ? await ImagePicker.launchCameraAsync(op) : await ImagePicker.launchImageLibraryAsync(op)
    if (r.canceled) return
    const { uri, width, height } = r.assets[0]
    setFoto(uri)
    setRes(null)
    setVision(null)
    setProporcion(width && height ? Math.min(2, Math.max(0.5, width / height)) : 1)
    await ejecutarDiagnostico(uri)
  }

  return (
    <ScrollView contentContainerStyle={s.contenido}>
      {!foto && (
        <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }, brillo(C.acento)]}>
          <Text style={[s.sobre, { color: C.acento }]}>DIAGNÓSTICO FITOSANITARIO</Text>
          <Text style={[s.titulo, { color: C.texto }]}>Toma una foto de cerca a una hoja o mazorca</Text>
          <Text style={[s.tenue, { color: C.tenue }]}>
            Detecta: <Text style={{ color: C.acento, fontWeight: '700' }}>{textoDetecta}</Text> offline. Con buena luz y una sola hoja en la foto.
          </Text>
          <View style={s.fila}>
            {cultivosInstalados.map((k) => {
              const c = CULTIVOS[k]
              if (!c) return null
              return (
                <Text key={k} style={[s.etiqueta, { color: c.color, borderColor: c.color + '55', backgroundColor: C.fondo2 }]}>
                  {c.nombre}
                </Text>
              )
            })}
          </View>
          {cultivosDisponibles.length > 0 && (
            <View style={{ gap: 6, marginTop: 4 }}>
              <Text style={[s.tenue, { color: C.tenue, fontSize: 12 }]}>Disponible para descargar:</Text>
              <View style={s.fila}>
                {cultivosDisponibles.map((k) => {
                  const c = CULTIVOS[k]
                  if (!c) return null
                  return (
                    <Text key={k} style={[s.etiqueta, { color: C.tenue, borderColor: C.borde2, backgroundColor: C.fondo2 }]}>
                      {c.nombre}
                    </Text>
                  )
                })}
              </View>
              <Pressable
                onPress={onIrAMisCultivos}
                style={({ pressed }) => [
                  s.botonDisponibles,
                  { borderColor: C.acento, backgroundColor: C.acento + '15' },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={{ color: C.acento, fontSize: 12, fontWeight: '700' }}>
                  + Descargar en Mis cultivos ({cultivosDisponibles.length} disponibles)
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
      {!foto && <QueDetecta onIrAMisCultivos={onIrAMisCultivos} />}
      {!foto && <GuiaFoto />}
      {foto && <VisionIA foto={foto} proporcion={proporcion} vision={vision} cargando={cargando} />}
      <View style={s.fila}>
        <Boton texto={foto ? 'Otra foto' : 'Cámara'} principal onPress={() => elegir(true)} />
        <Boton texto="Galería" onPress={() => elegir(false)} />
      </View>
      {cargando && <Analizando />}
      {error && (
        <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.coral }, brillo(C.coral)]}>
          <Text style={{ color: C.coral }}>{error}</Text>
        </View>
      )}
      {res && foto && (
        <TarjetaResultado
          r={res}
          foto={foto}
          vision={vision}
          onOtra={() => elegir(true)}
          onDiagnosticarServidor={() => ejecutarDiagnostico(foto, true)}
          onModeloDescargado={() => ejecutarDiagnostico(foto, false)}
        />
      )}
      {res && foto && <AnotarEnParcela key={foto} resultado={res} foto={foto} />}
    </ScrollView>
  )
}

function Historial() {
  const { colores: C } = useTema()
  const { cultivosInstalados } = useCultivosInstalados()
  const [filas, setFilas] = useState<Fila[]>([])
  const [mapaParcelas, setMapaParcelas] = useState<Record<number, string>>({})
  const [pend, setPend] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Filtros y búsqueda
  const [q, setQ] = useState('')
  const [cultivoSel, setCultivoSel] = useState<string>('todos')
  const [estadoSel, setEstadoSel] = useState<'todos' | 'enferma' | 'sana' | 'no_concluyente'>('todos')
  const [urgenciaSel, setUrgenciaSel] = useState<string>('todas')
  const [fechaSel, setFechaSel] = useState<'todo' | 'hoy' | '7dias' | '30dias'>('todo')
  const [ordenReciente, setOrdenReciente] = useState(true)

  const cargar = useCallback(() => {
    try {
      setFilas(listar())
      setPend(pendientes())
      const ps = listarParcelas()
      const m: Record<number, string> = {}
      for (const p of ps) m[p.id] = p.nombre
      setMapaParcelas(m)
    } catch {
      setFilas([])
      setPend(0)
      setMapaParcelas({})
    }
  }, [])
  useEffect(cargar, [cargar])

  const abrirOpciones = (f: Fila) => {
    const opciones: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = []

    if (f.parcela_id) {
      opciones.push({
        text: 'Quitar de la parcela',
        onPress: () => quitarDeParcelaAccion(f),
      })
    } else {
      opciones.push({
        text: 'Agregar a parcela',
        onPress: () => agregarAParcelaAccion(f),
      })
    }

    opciones.push({
      text: 'Borrar',
      style: 'destructive',
      onPress: () => borrarAccion(f),
    })

    opciones.push({
      text: 'Cancelar',
      style: 'cancel',
    })

    Alert.alert('Opciones del diagnóstico', 'Elige una acción:', opciones)
  }

  const borrarAccion = (f: Fila) => {
    Alert.alert(
      'Borrar diagnóstico',
      'Se borrara este diagnostico. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              borrar(f.id)
              if (f.parcela_id) {
                quitarDiagnosticoDeParcela(f.parcela_id, f.id)
              }
              if (cuentaActual() && (await enLinea()) && f.servidor_id) {
                await borrarDiagnosticoRemoto(f.servidor_id).catch(() => {})
              }
            } catch {}
            cargar()
          },
        },
      ]
    )
  }

  const quitarDeParcelaAccion = async (f: Fila) => {
    try {
      const pid = f.parcela_id
      asignarParcela(f.id, null)
      if (pid) {
        quitarDiagnosticoDeParcela(pid, f.id)
      }
      if (cuentaActual() && (await enLinea()) && f.servidor_id && pid) {
        await quitarDiagnosticoDeParcelaRemota(pid, f.servidor_id).catch(() => {})
      }
    } catch {}
    cargar()
  }

  const agregarAParcelaAccion = (f: Fila) => {
    try {
      const misParcelas = listarParcelas()
      if (!misParcelas.length) {
        Alert.alert('Sin parcelas', 'Aún no registras parcelas. Crea una en la sección Parcelas.')
        return
      }
      Alert.alert(
        'Agregar a parcela',
        'Selecciona la parcela a la que deseas vincular este diagnóstico:',
        [
          ...misParcelas.map((p) => ({
            text: p.nombre,
            onPress: async () => {
              try {
                asignarParcela(f.id, p.id)
                agregarDiagnosticoAParcela(p.id, f.id, f, f.foto)
                if (cuentaActual() && (await enLinea()) && f.servidor_id) {
                  await agregarDiagnosticoAParcelaRemota(p.id, f.servidor_id).catch(() => {})
                }
              } catch {}
              cargar()
            },
          })),
          { text: 'Cancelar', style: 'cancel' },
        ]
      )
    } catch {}
  }

  const sinc = async () => {
    setEnviando(true); setAviso(null)
    try {
      setAviso(`${await sincronizar()} diagnósticos enviados al servidor.`)
    } catch (e: any) {
      setAviso(e?.message ?? 'No se pudo sincronizar.')
    } finally {
      setEnviando(false); cargar()
    }
  }

  // Filtrado reactivo optimizado en memoria
  const filasFiltradas = useMemo(() => {
    const qNorm = q.trim().toLowerCase()
    const ahora = Date.now()
    const hoy = new Date()

    const resultado = filas.filter((f) => {
      // 1. Cultivo instalado o seleccionado
      if (cultivoSel !== 'todos' && f.cultivo !== cultivoSel) return false

      // 2. Estado (Enferma / Sana / No concluyente)
      if (estadoSel !== 'todos') {
        const esSanaBool = f.clase ? esSana(f.clase) : false
        if (estadoSel === 'sana') {
          if (f.estado !== 'diagnostico' || !f.clase || !esSanaBool) return false
        } else if (estadoSel === 'enferma') {
          if (f.estado !== 'diagnostico' || !f.clase || esSanaBool) return false
        } else if (estadoSel === 'no_concluyente') {
          if (f.estado === 'diagnostico' && f.clase) return false
        }
      }

      // 3. Nivel de urgencia
      if (urgenciaSel !== 'todas') {
        const urg = f.clase ? infoClase(f.clase, f.etiqueta).urgencia : 'ninguna'
        if (urg !== urgenciaSel) return false
      }

      // 4. Rango de fecha
      if (fechaSel !== 'todo') {
        const d = new Date(f.fecha)
        if (fechaSel === 'hoy') {
          if (d.getDate() !== hoy.getDate() || d.getMonth() !== hoy.getMonth() || d.getFullYear() !== hoy.getFullYear()) return false
        } else if (fechaSel === '7dias') {
          if (ahora - d.getTime() > 7 * 864e5) return false
        } else if (fechaSel === '30dias') {
          if (ahora - d.getTime() > 30 * 864e5) return false
        }
      }

      // 5. Búsqueda por texto (enfermedad, cultivo, provincia, notas)
      if (qNorm) {
        const enf = f.clase ? infoClase(f.clase, f.etiqueta).nombre.toLowerCase() : (f.estado === 'rechazada' ? 'foto no válida' : 'no concluyente')
        const cult = (CULTIVOS[f.cultivo ?? '']?.nombre ?? f.cultivo ?? '').toLowerCase()
        const prov = (f.provincia ?? '').toLowerCase()
        const motivo = (f.motivo ?? '').toLowerCase()
        const nota = ((f as any).nota ?? (f as any).notas ?? f.error ?? '').toLowerCase()
        const coincide = enf.includes(qNorm) || cult.includes(qNorm) || prov.includes(qNorm) || motivo.includes(qNorm) || nota.includes(qNorm)
        if (!coincide) return false
      }

      return true
    })

    // Orden por fecha
    resultado.sort((a, b) => {
      const tA = new Date(a.fecha).getTime() || a.id
      const tB = new Date(b.fecha).getTime() || b.id
      return ordenReciente ? tB - tA : tA - tB
    })

    return resultado
  }, [filas, q, cultivoSel, estadoSel, urgenciaSel, fechaSel, ordenReciente])

  const hayFiltros = q.trim() !== '' || cultivoSel !== 'todos' || estadoSel !== 'todos' || urgenciaSel !== 'todas' || fechaSel !== 'todo' || !ordenReciente

  const quitarFiltros = () => {
    setQ('')
    setCultivoSel('todos')
    setEstadoSel('todos')
    setUrgenciaSel('todas')
    setFechaSel('todo')
    setOrdenReciente(true)
  }

  return (
    <FlatList
      contentContainerStyle={s.contenido}
      data={filasFiltradas}
      keyExtractor={(f) => String(f.id)}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 8 }}>
          <Boton texto={enviando ? 'Enviando…' : `Sincronizar (${pend} pendientes)`} principal onPress={sinc} desactivado={enviando || pend === 0} />
          <Text style={[s.tenue, { color: C.tenue }]}>{cuentaActual() ? 'Con tu cuenta, se suben solos cuando hay internet y los ves en la web.' : 'Opcional: con internet, tus fotos ayudan al mapa de brotes de San Martín. Inicia sesión en Cuenta para verlos también en la web.'}</Text>
          {aviso && <Text style={{ color: C.acento }}>{aviso}</Text>}

          {/* Barra de búsqueda por texto */}
          <View style={[s.cajaBusqueda, { backgroundColor: C.fondo2, borderColor: C.borde2 }]}>
            <Text style={{ fontSize: 16 }}>🔍</Text>
            <TextInput
              style={[s.inputBusqueda, { color: C.texto }]}
              value={q}
              onChangeText={setQ}
              placeholder="Buscar enfermedad, cultivo, provincia, notas…"
              placeholderTextColor={C.tenue}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {q.length > 0 && (
              <Pressable onPress={() => setQ('')} hitSlop={8} style={{ padding: 4 }}>
                <Text style={{ color: C.tenue, fontSize: 14, fontWeight: '700' }}>✕</Text>
              </Pressable>
            )}
          </View>

          {/* Filtros: Cultivo */}
          <View style={s.grupoFiltro}>
            <Text style={[s.filtroTitulo, { color: C.tenue }]}>Cultivo:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filaChips}>
              <Pressable
                onPress={() => setCultivoSel('todos')}
                style={[s.chipFiltro, { borderColor: C.borde2, backgroundColor: C.fondo2 }, cultivoSel === 'todos' && { borderColor: C.acento, backgroundColor: C.acento + '22' }]}
              >
                <Text style={[s.chipFiltroTxt, { color: cultivoSel === 'todos' ? C.acento : C.texto }]}>Todos</Text>
              </Pressable>
              {cultivosInstalados.map((k) => {
                const c = CULTIVOS[k]
                if (!c) return null
                const sel = cultivoSel === k
                return (
                  <Pressable
                    key={k}
                    onPress={() => setCultivoSel(k)}
                    style={[s.chipFiltro, { borderColor: C.borde2, backgroundColor: C.fondo2 }, sel && { borderColor: c.color, backgroundColor: c.color + '22' }]}
                  >
                    <Text style={[s.chipFiltroTxt, { color: sel ? c.color : C.texto }]}>{c.nombre}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>

          {/* Filtros: Estado */}
          <View style={s.grupoFiltro}>
            <Text style={[s.filtroTitulo, { color: C.tenue }]}>Estado:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filaChips}>
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'enferma', label: 'Enferma', color: C.rosa },
                { id: 'sana', label: 'Sana', color: C.sana },
                { id: 'no_concluyente', label: 'No concluyente', color: C.oro },
              ].map((opt) => {
                const sel = estadoSel === opt.id
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setEstadoSel(opt.id as any)}
                    style={[s.chipFiltro, { borderColor: C.borde2, backgroundColor: C.fondo2 }, sel && { borderColor: opt.color ?? C.acento, backgroundColor: (opt.color ?? C.acento) + '22' }]}
                  >
                    <Text style={[s.chipFiltroTxt, { color: sel ? (opt.color ?? C.acento) : C.texto }]}>{opt.label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>

          {/* Filtros: Urgencia */}
          <View style={s.grupoFiltro}>
            <Text style={[s.filtroTitulo, { color: C.tenue }]}>Urgencia:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filaChips}>
              {[
                { id: 'todas', label: 'Todas' },
                { id: 'critica', label: 'Crítica', color: C.coral },
                { id: 'alta', label: 'Alta', color: C.coral },
                { id: 'media', label: 'Media', color: C.oro },
                { id: 'ninguna', label: 'Ninguna / Sana', color: C.sana },
              ].map((opt) => {
                const sel = urgenciaSel === opt.id
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setUrgenciaSel(opt.id)}
                    style={[s.chipFiltro, { borderColor: C.borde2, backgroundColor: C.fondo2 }, sel && { borderColor: opt.color ?? C.acento, backgroundColor: (opt.color ?? C.acento) + '22' }]}
                  >
                    <Text style={[s.chipFiltroTxt, { color: sel ? (opt.color ?? C.acento) : C.texto }]}>{opt.label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>

          {/* Filtros: Rango de fecha y orden */}
          <View style={s.grupoFiltro}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[s.filtroTitulo, { color: C.tenue }]}>Fecha y orden:</Text>
              <Pressable onPress={() => setOrdenReciente(!ordenReciente)} hitSlop={6} style={[s.chipOrden, { borderColor: C.borde2, backgroundColor: C.fondo2 }]}>
                <Text style={{ color: C.acento, fontSize: 12, fontWeight: '700' }}>
                  {ordenReciente ? '↓ Más recientes' : '↑ Más antiguos'}
                </Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filaChips}>
              {[
                { id: 'todo', label: 'Todo' },
                { id: 'hoy', label: 'Hoy' },
                { id: '7dias', label: '7 días' },
                { id: '30dias', label: '30 días' },
              ].map((opt) => {
                const sel = fechaSel === opt.id
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setFechaSel(opt.id as any)}
                    style={[s.chipFiltro, { borderColor: C.borde2, backgroundColor: C.fondo2 }, sel && { borderColor: C.acento, backgroundColor: C.acento + '22' }]}
                  >
                    <Text style={[s.chipFiltroTxt, { color: sel ? C.acento : C.texto }]}>{opt.label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>

          {/* Contador de resultados y Quitar filtros */}
          <View style={s.contadorFila}>
            <Text style={[s.contadorTxt, { color: C.tenue }]}>
              {filas.length === 0
                ? '0 diagnósticos'
                : filasFiltradas.length === filas.length
                ? `${filas.length} ${filas.length === 1 ? 'diagnóstico' : 'diagnósticos'}`
                : `${filasFiltradas.length} de ${filas.length} diagnósticos`}
            </Text>
            {hayFiltros && (
              <Pressable onPress={quitarFiltros} hitSlop={8}>
                <Text style={{ color: C.acento, fontSize: 13, fontWeight: '700' }}>Quitar filtros</Text>
              </Pressable>
            )}
          </View>
        </View>
      }
      ListEmptyComponent={
        filas.length === 0 ? (
          <Text style={[s.tenue, { color: C.tenue, textAlign: 'center', marginTop: 30 }]}>Aún no hay diagnósticos.</Text>
        ) : (
          <View style={[s.vacioCaja, { backgroundColor: C.sup, borderColor: C.borde }]}>
            <Text style={{ fontSize: 32, textAlign: 'center' }}>🔍</Text>
            <Text style={[s.texto, { color: C.texto, fontWeight: '700', textAlign: 'center' }]}>
              No se encontraron diagnósticos
            </Text>
            <Text style={[s.tenue, { color: C.tenue, textAlign: 'center', fontSize: 13 }]}>
              No hay registros con los filtros o búsqueda actuales.
            </Text>
            <Pressable onPress={quitarFiltros} style={[s.botonQuitarFiltros, { backgroundColor: C.acento }]}>
              <Text style={[s.botonQuitarFiltrosTxt, { color: C.textoBotonAcento }]}>Quitar filtros</Text>
            </Pressable>
          </View>
        )
      }
      renderItem={({ item: f }) => {
        const sana = f.clase ? esSana(f.clase) : false
        const color = f.estado !== 'diagnostico' ? C.oro : sana ? C.sana : C.rosa
        const nomParcela = f.parcela_id ? mapaParcelas[f.parcela_id] : null
        return (
          <View style={[s.item, { backgroundColor: C.sup, borderColor: C.borde, borderLeftColor: color }]}>
            <Image source={{ uri: f.foto }} style={s.mini} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.texto, { color: C.texto, fontWeight: '700' }]}>{f.clase ? infoClase(f.clase, f.etiqueta).nombre : f.estado === 'rechazada' ? 'Foto no válida' : 'No concluyente'}</Text>
              <Text style={[s.tenue, { color: C.tenue }]}>
                {CULTIVOS[f.cultivo ?? '']?.nombre ?? '—'}{f.provincia ? ` · ${f.provincia}` : ''} · {f.confianza ? Math.round(f.confianza * 100) + ' %' : ''} · {new Date(f.fecha).toLocaleString('es-PE')}
              </Text>
              {nomParcela && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <Text style={[s.chipParcela, { color: C.acento, borderColor: C.acento + '55', backgroundColor: C.fondo2 }]}>
                    🌱 {nomParcela}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={{ color: f.sincronizado === 1 ? C.acento : f.sincronizado === 2 ? C.coral : C.tenue, fontSize: 16 }}>{f.sincronizado === 1 ? '☁' : f.sincronizado === 2 ? '⚠' : '⏳'}</Text>
              <Pressable
                onPress={() => abrirOpciones(f)}
                hitSlop={10}
                style={s.botonTresPuntos}
                accessibilityLabel="Opciones del diagnóstico"
              >
                <Text style={{ color: C.texto, fontSize: 20, fontWeight: '800', lineHeight: 22 }}>⋮</Text>
              </Pressable>
            </View>
          </View>
        )
      }}
      ListFooterComponent={filasFiltradas.length ? <Text style={[s.pie, { color: C.tenue, textAlign: 'center' }]}>Toca el botón ⋮ para gestionar el diagnóstico o asignarlo a una parcela.</Text> : undefined}
    />
  )
}

function Boton({ texto, onPress, principal, desactivado }: { texto: string; onPress: () => void; principal?: boolean; desactivado?: boolean }) {
  const { colores: C, brillo } = useTema()
  return (
    <Pressable onPress={onPress} disabled={desactivado}
      style={({ pressed }) => [
        s.boton,
        principal ? { backgroundColor: C.acento, ...brillo(C.acento) } : { backgroundColor: C.sup, borderColor: C.borde2 },
        (pressed || desactivado) && { opacity: 0.6 }
      ]}>
      <Text style={[s.botonTxt, { color: principal ? C.textoBotonAcento : C.texto }]}>{texto}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  marca: { fontSize: 24, fontWeight: '800', letterSpacing: 0.5, flexShrink: 0 },
  chip: { fontSize: 12, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 },
  contenido: { padding: 16, gap: 14, paddingBottom: 36 },
  tarjeta: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  sobre: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  titulo: { fontSize: 22, fontWeight: '800' },
  texto: { fontSize: 15, lineHeight: 22 },
  tenue: { fontSize: 13, lineHeight: 19 },
  cursiva: { fontStyle: 'italic' },
  pie: { fontSize: 11, marginTop: 10 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  etiqueta: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '600' },
  botonDisponibles: { borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  boton: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  botonTxt: { fontWeight: '700', fontSize: 15 },
  pestanas: { flexDirection: 'row', borderTopWidth: 1 },
  pestana: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52, paddingVertical: 6, paddingHorizontal: 2, borderTopWidth: 2, borderTopColor: 'transparent', gap: 2 },
  pestanaTxt: { fontSize: 11, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12, borderLeftWidth: 3.5, borderWidth: 1 },
  mini: { width: 50, height: 50, borderRadius: 10 },
  cajaBusqueda: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46 },
  inputBusqueda: { flex: 1, fontSize: 14, paddingVertical: 8 },
  grupoFiltro: { gap: 6 },
  filtroTitulo: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  filaChips: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chipFiltro: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
  chipFiltroTxt: { fontSize: 12, fontWeight: '700' },
  chipOrden: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  contadorFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, paddingBottom: 2 },
  contadorTxt: { fontSize: 13, fontWeight: '600' },
  vacioCaja: { borderWidth: 1, borderRadius: 16, padding: 24, gap: 8, alignItems: 'center', marginTop: 12 },
  botonQuitarFiltros: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  botonQuitarFiltrosTxt: { fontWeight: '700', fontSize: 14 },
  chipParcela: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  botonTresPuntos: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
})
