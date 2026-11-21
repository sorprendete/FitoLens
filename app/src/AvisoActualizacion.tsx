import { useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTema } from './tema'
import { Novedad, VERSION_APP, buscarActualizacion, esMayor, instalarActualizacion } from './actualizacion'
import { disponible, escuchar, estado as consultarEstado, pausar, reanudar, cancelar, instalar, puedeInstalar, type EstadoDescarga } from '../modules/descarga-apk'

const CADA = 60 * 60 * 1000 // como mucho una consulta por hora

export default function AvisoActualizacion() {
  const { colores: C } = useTema()
  const [nueva, setNueva] = useState<Novedad | null>(null)
  const [ed, setEd] = useState<EstadoDescarga | null>(null)
  const [oculto, setOculto] = useState(false)
  const [faltaPermiso, setFaltaPermiso] = useState(false)
  const ultima = useRef(0)

  useEffect(() => {
    const revisar = () => {
      if (Date.now() - ultima.current < CADA) return
      ultima.current = Date.now()
      buscarActualizacion().then(setNueva)
    }
    revisar()
    const sub = AppState.addEventListener('change', (e) => e === 'active' && revisar())
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!disponible) return
    const vigente = (e: EstadoDescarga) => e.estado !== 'inactiva' && (!e.version || esMayor(e.version, VERSION_APP))
    const inicial = consultarEstado()
    if (vigente(inicial)) setEd(inicial)

    const desuscribir = escuchar((e) => {
      setEd(vigente(e) ? e : null)
      if (e.estado !== 'lista') setFaltaPermiso(false)
    })
    return desuscribir
  }, [])

  useEffect(() => {
    if (!faltaPermiso) return
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active' && puedeInstalar()) setFaltaPermiso(false)
    })
    return () => sub.remove()
  }, [faltaPermiso])

  if (oculto && !ed) return null
  if (!nueva && !ed) return null

  if (ed && ed.estado !== 'inactiva') {
    const pct = ed.total > 0 ? Math.round((ed.bytes / ed.total) * 100) : 0
    const descMB = (ed.bytes / (1024 * 1024)).toFixed(0)
    const totalMB = ed.total > 0 ? (ed.total / (1024 * 1024)).toFixed(0) : '?'
    const ver = ed.version || nueva?.version || ''

    let texto = ''
    let botones: React.ReactNode = null

    switch (ed.estado) {
      case 'descargando':
        texto = `Descargando… ${pct} % · ${descMB} de ${totalMB} MB`
        botones = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={pausar} hitSlop={8} style={s.accionBtn}><Text style={[s.luego, { color: C.tenue }]}>Pausar</Text></Pressable>
            <Pressable onPress={cancelar} hitSlop={8} style={s.accionBtn}><Text style={[s.cancelar, { color: C.coral }]}>Cancelar</Text></Pressable>
          </View>
        )
        break
      case 'pausada':
        texto = `En pausa · ${pct} %`
        botones = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={reanudar} style={[s.boton, { backgroundColor: C.acento }]}><Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>Reanudar</Text></Pressable>
            <Pressable onPress={cancelar} hitSlop={8} style={s.accionBtn}><Text style={[s.cancelar, { color: C.coral }]}>Cancelar</Text></Pressable>
          </View>
        )
        break
      case 'sin_conexion':
        texto = `Sin conexión · ${pct} %`
        botones = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={reanudar} style={[s.boton, { backgroundColor: C.acento }]}><Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>Reintentar</Text></Pressable>
            <Pressable onPress={cancelar} hitSlop={8} style={s.accionBtn}><Text style={[s.cancelar, { color: C.coral }]}>Cancelar</Text></Pressable>
          </View>
        )
        break
      case 'lista':
        texto = faltaPermiso
          ? 'Falta permiso: activa "Permitir desde esta fuente" y toca Instalar.'
          : 'Lista para instalar'
        botones = (
          <Pressable onPress={() => {
            const res = instalar()
            if (res === 'permiso_requerido') setFaltaPermiso(true)
            else if (res === 'archivo_no_encontrado' || res === 'no_lista') { setEd(null); setFaltaPermiso(false) }
          }} style={[s.boton, { backgroundColor: C.acento }]}><Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>Instalar</Text></Pressable>
        )
        break
      case 'error':
        texto = ed.error || 'Error en la descarga'
        botones = (
          <Pressable onPress={() => setEd(null)} hitSlop={8} style={s.accionBtn}><Text style={[s.luego, { color: C.tenue }]}>Cerrar</Text></Pressable>
        )
        break
    }

    return (
      <View style={[s.caja, { backgroundColor: C.sup, borderColor: C.acento + '66' }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.titulo, { color: C.texto }]}>{ver ? `FitoLens ${ver}` : 'Actualización'}</Text>
          <Text style={[s.texto, { color: C.tenue }]}>{texto}</Text>
        </View>
        {botones}
      </View>
    )
  }

  if (!nueva) return null
  const actualizar = () => {
    setFaltaPermiso(false)
    instalarActualizacion(nueva)
  }

  return (
    <View style={[s.caja, { backgroundColor: C.sup, borderColor: C.acento + '66' }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.titulo, { color: C.texto }]}>Nueva versión {nueva.version}</Text>
        <Text style={[s.texto, { color: C.tenue }]}>
          {nueva.notas || `Tienes la ${VERSION_APP}.${nueva.tamano_mb ? ` Descarga de ${nueva.tamano_mb} MB.` : ''}`}
        </Text>
      </View>
      <Pressable onPress={() => setOculto(true)} hitSlop={8} style={s.accionBtn}><Text style={[s.luego, { color: C.tenue }]}>Luego</Text></Pressable>
      <Pressable onPress={actualizar} style={[s.boton, { backgroundColor: C.acento }]}><Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>Actualizar</Text></Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  titulo: { fontWeight: '700', fontSize: 15 },
  texto: { fontSize: 13 },
  luego: { fontWeight: '600' },
  cancelar: { fontWeight: '600' },
  accionBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  boton: { borderRadius: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  botonTxt: { fontWeight: '800' },
})
