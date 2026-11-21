import { useCallback, useEffect, useState } from 'react'
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
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
import { enLinea, enviar } from './src/servidor'
import { Fila, borrar, guardar, listar, pendientes, sincronizar, sincronizarSola } from './src/historial'
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
  const [filas, setFilas] = useState<Fila[]>([])
  const [pend, setPend] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const cargar = useCallback(() => { setFilas(listar()); setPend(pendientes()) }, [])
  useEffect(cargar, [cargar])

  const sinc = async () => {
    setEnviando(true); setAviso(null)
    try { setAviso(`${await sincronizar()} diagnósticos enviados al servidor.`) } catch (e: any) { setAviso(e?.message ?? 'No se pudo sincronizar.') }
    finally { setEnviando(false); cargar() }
  }

  return (
    <FlatList
      contentContainerStyle={s.contenido}
      data={filas}
      keyExtractor={(f) => String(f.id)}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 6 }}>
          <Boton texto={enviando ? 'Enviando…' : `Sincronizar (${pend} pendientes)`} principal onPress={sinc} desactivado={enviando || pend === 0} />
          <Text style={[s.tenue, { color: C.tenue }]}>{cuentaActual() ? 'Con tu cuenta, se suben solos cuando hay internet y los ves en la web.' : 'Opcional: con internet, tus fotos ayudan al mapa de brotes de San Martín. Inicia sesión en Cuenta para verlos también en la web.'}</Text>
          {aviso && <Text style={{ color: C.acento }}>{aviso}</Text>}
        </View>
      }
      ListEmptyComponent={<Text style={[s.tenue, { color: C.tenue, textAlign: 'center', marginTop: 30 }]}>Aún no hay diagnósticos.</Text>}
      renderItem={({ item: f }) => {
        const sana = f.clase ? esSana(f.clase) : false
        const color = f.estado !== 'diagnostico' ? C.oro : sana ? C.sana : C.rosa
        return (
          <Pressable onLongPress={() => { borrar(f.id); cargar() }} style={[s.item, { backgroundColor: C.sup, borderColor: C.borde, borderLeftColor: color }]}>
            <Image source={{ uri: f.foto }} style={s.mini} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.texto, { color: C.texto, fontWeight: '700' }]}>{f.clase ? infoClase(f.clase, f.etiqueta).nombre : f.estado === 'rechazada' ? 'Foto no válida' : 'No concluyente'}</Text>
              <Text style={[s.tenue, { color: C.tenue }]}>{CULTIVOS[f.cultivo ?? '']?.nombre ?? '—'} · {f.confianza ? Math.round(f.confianza * 100) + ' %' : ''} · {new Date(f.fecha).toLocaleString('es-PE')}</Text>
            </View>
            <Text style={{ color: f.sincronizado === 1 ? C.acento : f.sincronizado === 2 ? C.coral : C.tenue, fontSize: 16 }}>{f.sincronizado === 1 ? '☁' : f.sincronizado === 2 ? '⚠' : '⏳'}</Text>
          </Pressable>
        )
      }}
      ListFooterComponent={filas.length ? <Text style={[s.pie, { color: C.tenue, textAlign: 'center' }]}>Mantén presionado un diagnóstico para borrarlo.</Text> : undefined}
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
})
