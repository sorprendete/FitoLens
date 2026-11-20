import { useCallback, useEffect, useState } from 'react'
import { FlatList, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as ImagePicker from 'expo-image-picker'
import { C, brillo } from './src/tema'
import Parcelas, { AnotarEnParcela } from './src/Parcelas'
import { CULTIVOS, esSana, infoClase } from './src/catalogo'
import { Resultado, Vision, diagnosticarLocal, hayIaLocal } from './src/ia'
import VisionIA from './src/VisionIA'
import { Analizando, GuiaFoto, TarjetaResultado } from './src/Resultado'
import { enLinea, enviar } from './src/servidor'
import { Fila, borrar, guardar, listar, pendientes, sincronizar, sincronizarSola } from './src/historial'
import Cuenta from './src/Cuenta'
import AvisoActualizacion from './src/AvisoActualizacion'
import { cargarCuenta, cuentaActual, provinciaActual } from './src/cuenta'

type Vista = 'diagnosticar' | 'historial' | 'parcelas' | 'cuenta'
const PESTANAS: Record<Vista, string> = { diagnosticar: 'Diagnosticar', historial: 'Historial', parcelas: 'Parcelas', cuenta: 'Cuenta' }

export default function App() {
  const [vista, setVista] = useState<Vista>('diagnosticar')
  // Cuenta opcional: si hay sesión, la cola se sube sola cuando vuelve internet.
  useEffect(() => { cargarCuenta(); return sincronizarSola() }, [])
  return (
    <SafeAreaView style={s.raiz}>
      <StatusBar style="light" />
      <View style={s.cabecera}>
        <Text style={s.marca}>Fito<Text style={{ color: C.acento }}>Lens</Text></Text>
        <Text style={s.chip}>{hayIaLocal() ? '● IA en el teléfono' : '● IA en el servidor'}</Text>
      </View>
      <AvisoActualizacion />
      {vista === 'diagnosticar' ? <Diagnosticar /> : vista === 'historial' ? <Historial /> : vista === 'parcelas' ? <Parcelas /> : <Cuenta />}
      <View style={s.pestanas}>
        {(Object.keys(PESTANAS) as Vista[]).map((v) => (
          <Pressable key={v} onPress={() => setVista(v)} style={[s.pestana, vista === v && { borderTopColor: C.acento }]}>
            <Text style={[s.pestanaTxt, vista === v && { color: C.acento }]}>{PESTANAS[v]}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  )
}

function Diagnosticar() {
  const [foto, setFoto] = useState<string | null>(null)
  const [res, setRes] = useState<Resultado | null>(null)
  const [vision, setVision] = useState<Vision | null>(null)
  const [proporcion, setProporcion] = useState(1)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const elegir = async (camara: boolean) => {
    setError(null)
    const permiso = camara ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permiso.granted) return setError('Sin permiso para usar la ' + (camara ? 'cámara.' : 'galería.'))
    const op: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 }
    const r = camara ? await ImagePicker.launchCameraAsync(op) : await ImagePicker.launchImageLibraryAsync(op)
    if (r.canceled) return
    const { uri, width, height } = r.assets[0]
    setFoto(uri); setRes(null); setVision(null); setCargando(true)
    setProporcion(width && height ? Math.min(2, Math.max(0.5, width / height)) : 1)
    try {
      let d: Resultado
      if (hayIaLocal()) { const { vision: v, ...local } = await diagnosticarLocal(uri); d = local; setVision(v) }
      else if (await enLinea()) d = await enviar(uri, provinciaActual())
      else throw new Error('Esta versión no trae la IA en el teléfono y no hay internet.')
      guardar(uri, d)
      setRes(d)
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo diagnosticar.')
    } finally { setCargando(false) }
  }

  return (
    <ScrollView contentContainerStyle={s.contenido}>
      {!foto && (
        <View style={[s.tarjeta, brillo(C.acento)]}>
          <Text style={s.sobre}>DIAGNÓSTICO SIN INTERNET</Text>
          <Text style={s.titulo}>Toma una foto de cerca a una hoja o mazorca</Text>
          <Text style={s.tenue}>Café, cacao, papa, tomate, pimiento, maíz, limón y naranja. Con buena luz y una sola hoja en la foto.</Text>
          <View style={s.fila}>{Object.entries(CULTIVOS).map(([k, c]) => <Text key={k} style={[s.etiqueta, { color: c.color, borderColor: c.color + '55' }]}>{c.nombre}</Text>)}</View>
        </View>
      )}
      {!foto && <GuiaFoto />}
      {foto && <VisionIA foto={foto} proporcion={proporcion} vision={vision} cargando={cargando} />}
      <View style={s.fila}>
        <Boton texto={foto ? 'Otra foto' : 'Cámara'} principal onPress={() => elegir(true)} />
        <Boton texto="Galería" onPress={() => elegir(false)} />
      </View>
      {cargando && <Analizando />}
      {error && <View style={[s.tarjeta, brillo(C.coral)]}><Text style={{ color: C.coral }}>{error}</Text></View>}
      {res && foto && <TarjetaResultado r={res} foto={foto} vision={vision} onOtra={() => elegir(true)} />}
      {res && foto && <AnotarEnParcela key={foto} resultado={res} foto={foto} />}
    </ScrollView>
  )
}

function Historial() {
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
          <Text style={s.tenue}>{cuentaActual() ? 'Con tu cuenta, se suben solos cuando hay internet y los ves en la web.' : 'Opcional: con internet, tus fotos ayudan al mapa de brotes de San Martín. Inicia sesión en Cuenta para verlos también en la web.'}</Text>
          {aviso && <Text style={{ color: C.acento }}>{aviso}</Text>}
        </View>
      }
      ListEmptyComponent={<Text style={[s.tenue, { textAlign: 'center', marginTop: 30 }]}>Aún no hay diagnósticos.</Text>}
      renderItem={({ item: f }) => {
        const sana = f.clase ? esSana(f.clase) : false
        const color = f.estado !== 'diagnostico' ? C.oro : sana ? C.sana : C.rosa
        return (
          <Pressable onLongPress={() => { borrar(f.id); cargar() }} style={[s.item, { borderLeftColor: color }]}>
            <Image source={{ uri: f.foto }} style={s.mini} />
            <View style={{ flex: 1 }}>
              <Text style={[s.texto, { fontWeight: '700' }]}>{f.clase ? infoClase(f.clase, f.etiqueta).nombre : f.estado === 'rechazada' ? 'Foto no válida' : 'No concluyente'}</Text>
              <Text style={s.tenue}>{CULTIVOS[f.cultivo ?? '']?.nombre ?? '—'} · {f.confianza ? Math.round(f.confianza * 100) + ' %' : ''} · {new Date(f.fecha).toLocaleString('es-PE')}</Text>
            </View>
            <Text style={{ color: f.sincronizado === 1 ? C.acento : f.sincronizado === 2 ? C.coral : C.tenue }}>{f.sincronizado === 1 ? '☁' : f.sincronizado === 2 ? '⚠' : '⏳'}</Text>
          </Pressable>
        )
      }}
      ListFooterComponent={filas.length ? <Text style={[s.pie, { textAlign: 'center' }]}>Mantén presionado un diagnóstico para borrarlo.</Text> : undefined}
    />
  )
}

function Boton({ texto, onPress, principal, desactivado }: { texto: string; onPress: () => void; principal?: boolean; desactivado?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={desactivado}
      style={({ pressed }) => [s.boton, principal ? { backgroundColor: C.acento, ...brillo(C.acento) } : { borderColor: C.borde2 }, (pressed || desactivado) && { opacity: 0.6 }]}>
      <Text style={[s.botonTxt, principal && { color: C.fondo }]}>{texto}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: C.fondo, paddingTop: 30 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  marca: { color: C.texto, fontSize: 24, fontWeight: '800', letterSpacing: 0.5 },
  chip: { color: C.acento2, fontSize: 12, borderWidth: 1, borderColor: C.acento2 + '55', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  contenido: { padding: 16, gap: 14, paddingBottom: 30 },
  tarjeta: { backgroundColor: C.sup, borderWidth: 1, borderRadius: 18, padding: 18, gap: 6 },
  sobre: { color: C.acento, fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  titulo: { color: C.texto, fontSize: 22, fontWeight: '800' },
  texto: { color: C.texto, fontSize: 15, lineHeight: 22 },
  tenue: { color: C.tenue, fontSize: 13 },
  cursiva: { color: C.tenue, fontStyle: 'italic' },
  pie: { color: C.tenue, fontSize: 11, marginTop: 10 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  etiqueta: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, fontSize: 12, fontWeight: '600' },
  foto: { width: '100%', aspectRatio: 1, borderRadius: 18, borderWidth: 1, borderColor: C.borde2 },
  boton: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', backgroundColor: C.sup },
  botonTxt: { color: C.texto, fontWeight: '700', fontSize: 16 },
  centro: { alignItems: 'center', gap: 8, padding: 10 },
  barra: { height: 8, backgroundColor: C.fondo2, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  pestanas: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.borde, backgroundColor: C.fondo2 },
  pestana: { flex: 1, alignItems: 'center', paddingVertical: 14, borderTopWidth: 2, borderTopColor: 'transparent' },
  pestanaTxt: { color: C.tenue, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.sup, borderRadius: 14, padding: 10, borderLeftWidth: 3 },
  mini: { width: 52, height: 52, borderRadius: 10 },
})
