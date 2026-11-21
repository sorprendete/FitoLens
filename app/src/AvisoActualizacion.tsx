import { useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTema } from './tema'
import { Novedad, VERSION_APP, buscarActualizacion, esMayor, instalarActualizacion } from './actualizacion'
import { disponible, escuchar, estado as consultarEstado, pausar, reanudar, cancelar, instalar, puedeInstalar, abrirAjustesInstalacion, type EstadoDescarga } from '../modules/descarga-apk'
import { escucharTarjetaVisible, hayTarjetaVisible } from './TarjetaActualizacion'

const CADA = 60 * 60 * 1000 // como mucho una consulta por hora

export default function AvisoActualizacion() {
  const { colores: C } = useTema()
  const [nueva, setNueva] = useState<Novedad | null>(null)
  const [ed, setEd] = useState<EstadoDescarga | null>(null)
  const [oculto, setOculto] = useState(false)
  const [faltaPermiso, setFaltaPermiso] = useState(false)
  const [tarjetaEnPantalla, setTarjetaEnPantalla] = useState(hayTarjetaVisible())
  const ultima = useRef(0)

  useEffect(() => {
    return escucharTarjetaVisible(setTarjetaEnPantalla)
  }, [])

  useEffect(() => {
    let montado = true
    const revisar = () => {
      try {
        if (Date.now() - ultima.current < CADA) return
        ultima.current = Date.now()
        buscarActualizacion()
          .then((n) => {
            if (montado) setNueva(n)
          })
          .catch(() => {})
      } catch {}
    }
    revisar()
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active' && montado) revisar()
    })
    return () => {
      montado = false
      try { sub.remove() } catch {}
    }
  }, [])

  useEffect(() => {
    if (!disponible) return
    let montado = true
    const vigente = (e: EstadoDescarga | null | undefined): boolean => {
      if (!e || typeof e !== 'object') return false
      return e.estado !== 'inactiva' && (!e.version || esMayor(e.version, VERSION_APP))
    }

    try {
      const inicial = consultarEstado()
      if (montado && vigente(inicial)) setEd(inicial)
    } catch {}

    const desuscribir = escuchar((e) => {
      if (!montado) return
      try {
        setEd(vigente(e) ? e : null)
        if (e && e.estado !== 'lista') setFaltaPermiso(false)
      } catch {}
    })

    return () => {
      montado = false
      try { desuscribir?.() } catch {}
    }
  }, [])

  useEffect(() => {
    if (!faltaPermiso) return
    let montado = true
    const sub = AppState.addEventListener('change', (e) => {
      try {
        if (e === 'active' && montado && puedeInstalar()) {
          setFaltaPermiso(false)
          try { instalar() } catch {}
        }
      } catch {}
    })
    return () => {
      montado = false
      try { sub.remove() } catch {}
    }
  }, [faltaPermiso])

  if (tarjetaEnPantalla) return null
  if (oculto && !ed) return null
  if (!nueva && !ed) return null

  if (ed && ed.estado !== 'inactiva') {
    const total = ed.total > 0 ? ed.total : 0
    const bytes = ed.bytes > 0 ? ed.bytes : 0
    const pct = total > 0 ? Math.round((bytes / total) * 100) : 0
    const descMB = (bytes / (1024 * 1024)).toFixed(0)
    const totalMB = total > 0 ? (total / (1024 * 1024)).toFixed(0) : '?'
    const ver = ed.version || nueva?.version || ''

    let texto = ''
    let botones: React.ReactNode = null

    switch (ed.estado) {
      case 'descargando':
        texto = `Descargando… ${pct} % · ${descMB} de ${totalMB} MB`
        botones = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => { try { pausar() } catch {} }} hitSlop={8} style={s.accionBtn}>
              <Text style={[s.luego, { color: C.tenue }]}>Pausar</Text>
            </Pressable>
            <Pressable onPress={() => { try { cancelar(); setEd(null) } catch {} }} hitSlop={8} style={s.accionBtn}>
              <Text style={[s.cancelar, { color: C.coral }]}>Cancelar</Text>
            </Pressable>
          </View>
        )
        break
      case 'pausada':
        texto = `En pausa · ${pct} %`
        botones = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => { try { reanudar() } catch {} }} style={[s.boton, { backgroundColor: C.acento }]}>
              <Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>Reanudar</Text>
            </Pressable>
            <Pressable onPress={() => { try { cancelar(); setEd(null) } catch {} }} hitSlop={8} style={s.accionBtn}>
              <Text style={[s.cancelar, { color: C.coral }]}>Cancelar</Text>
            </Pressable>
          </View>
        )
        break
      case 'sin_conexion':
        texto = `Sin conexión · ${pct} %`
        botones = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => { try { reanudar() } catch {} }} style={[s.boton, { backgroundColor: C.acento }]}>
              <Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>Reintentar</Text>
            </Pressable>
            <Pressable onPress={() => { try { cancelar(); setEd(null) } catch {} }} hitSlop={8} style={s.accionBtn}>
              <Text style={[s.cancelar, { color: C.coral }]}>Cancelar</Text>
            </Pressable>
          </View>
        )
        break
      case 'lista':
        texto = faltaPermiso
          ? 'Falta permiso: activa "Permitir desde esta fuente" y toca Instalar.'
          : 'Lista para instalar'
        botones = (
          <Pressable onPress={() => {
            try {
              const res = instalar()
              if (res === 'permiso_requerido') {
                setFaltaPermiso(true)
                try { abrirAjustesInstalacion() } catch {}
              }
              else if (res === 'archivo_no_encontrado' || res === 'no_lista') {
                setEd(null)
                setFaltaPermiso(false)
              }
            } catch {
              setEd(null)
            }
          }} style={[s.boton, { backgroundColor: C.acento }]}>
            <Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>Instalar</Text>
          </Pressable>
        )
        break
      case 'error':
        texto = ed.error || 'Error en la descarga'
        botones = (
          <Pressable onPress={() => setEd(null)} hitSlop={8} style={s.accionBtn}>
            <Text style={[s.luego, { color: C.tenue }]}>Cerrar</Text>
          </Pressable>
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
    try {
      setFaltaPermiso(false)
      instalarActualizacion(nueva).catch(() => {})
    } catch {}
  }

  return (
    <View style={[s.caja, { backgroundColor: C.sup, borderColor: C.acento + '66' }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.titulo, { color: C.texto }]}>Nueva versión {nueva.version}</Text>
        <Text style={[s.texto, { color: C.tenue }]}>
          {nueva.notas || `Tienes la ${VERSION_APP}.${nueva.tamano_mb ? ` Descarga de ${nueva.tamano_mb} MB.` : ''}`}
        </Text>
      </View>
      <Pressable onPress={() => setOculto(true)} hitSlop={8} style={s.accionBtn}>
        <Text style={[s.luego, { color: C.tenue }]}>Luego</Text>
      </Pressable>
      <Pressable onPress={actualizar} style={[s.boton, { backgroundColor: C.acento }]}>
        <Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>Actualizar</Text>
      </Pressable>
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
