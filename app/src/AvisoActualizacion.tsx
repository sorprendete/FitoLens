import { useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { C } from './tema'
import { Novedad, VERSION_APP, buscarActualizacion, esMayor, instalarActualizacion } from './actualizacion'
import { disponible, escuchar, estado as consultarEstado, pausar, reanudar, cancelar, instalar, puedeInstalar, type EstadoDescarga } from '../modules/descarga-apk'

const CADA = 60 * 60 * 1000 // como mucho una consulta por hora

// Franja arriba de la app: "Hay una versión nueva" + Actualizar. Solo aparece con internet y en Android.
// Si hay una descarga en curso (servicio nativo), muestra progreso, pausa/reanuda y cancela.
export default function AvisoActualizacion() {
  const [nueva, setNueva] = useState<Novedad | null>(null)
  const [ed, setEd] = useState<EstadoDescarga | null>(null)
  const [oculto, setOculto] = useState(false)
  const [faltaPermiso, setFaltaPermiso] = useState(false)
  const ultima = useRef(0)

  // Buscar actualizaciones al abrir / volver
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

  // Consultar estado del servicio nativo y suscribirse a cambios
  useEffect(() => {
    if (!disponible) return
    // Estado inicial (por si la app se reabrió con una descarga en curso)
    // Una descarga de una versión que ya está instalada (o anterior) no se muestra.
    const vigente = (e: EstadoDescarga) => e.estado !== 'inactiva' && (!e.version || esMayor(e.version, VERSION_APP))
    const inicial = consultarEstado()
    if (vigente(inicial)) setEd(inicial)

    const desuscribir = escuchar((e) => {
      setEd(vigente(e) ? e : null)
      if (e.estado !== 'lista') setFaltaPermiso(false)
    })
    return desuscribir
  }, [])

  // Al volver de ajustes de Android, revalidar permiso
  useEffect(() => {
    if (!faltaPermiso) return
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active' && puedeInstalar()) setFaltaPermiso(false)
    })
    return () => sub.remove()
  }, [faltaPermiso])

  if (oculto && !ed) return null
  if (!nueva && !ed) return null

  // ── Descarga activa: mostrar progreso del servicio ───────────────────
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
          <>
            <Pressable onPress={pausar} hitSlop={8}><Text style={s.luego}>Pausar</Text></Pressable>
            <Pressable onPress={cancelar} hitSlop={8}><Text style={s.cancelar}>Cancelar</Text></Pressable>
          </>
        )
        break
      case 'pausada':
        texto = `En pausa · ${pct} %`
        botones = (
          <>
            <Pressable onPress={reanudar} style={s.boton}><Text style={s.botonTxt}>Reanudar</Text></Pressable>
            <Pressable onPress={cancelar} hitSlop={8}><Text style={s.cancelar}>Cancelar</Text></Pressable>
          </>
        )
        break
      case 'sin_conexion':
        texto = `Sin conexión · ${pct} %`
        botones = (
          <>
            <Pressable onPress={reanudar} style={s.boton}><Text style={s.botonTxt}>Reintentar</Text></Pressable>
            <Pressable onPress={cancelar} hitSlop={8}><Text style={s.cancelar}>Cancelar</Text></Pressable>
          </>
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
          }} style={s.boton}><Text style={s.botonTxt}>Instalar</Text></Pressable>
        )
        break
      case 'error':
        texto = ed.error || 'Error en la descarga'
        botones = (
          <Pressable onPress={() => setEd(null)} hitSlop={8}><Text style={s.luego}>Cerrar</Text></Pressable>
        )
        break
    }

    return (
      <View style={s.caja}>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>{ver ? `FitoLens ${ver}` : 'Actualización'}</Text>
          <Text style={s.texto}>{texto}</Text>
        </View>
        {botones}
      </View>
    )
  }

  // ── Sin descarga activa: ofrecer actualizar ──────────────────────────
  if (!nueva) return null
  const actualizar = () => {
    setFaltaPermiso(false)
    instalarActualizacion(nueva)
  }

  return (
    <View style={s.caja}>
      <View style={{ flex: 1 }}>
        <Text style={s.titulo}>Nueva versión {nueva.version}</Text>
        <Text style={s.texto}>
          {nueva.notas || `Tienes la ${VERSION_APP}.${nueva.tamano_mb ? ` Descarga de ${nueva.tamano_mb} MB.` : ''}`}
        </Text>
      </View>
      <Pressable onPress={() => setOculto(true)} hitSlop={8}><Text style={s.luego}>Luego</Text></Pressable>
      <Pressable onPress={actualizar} style={s.boton}><Text style={s.botonTxt}>Actualizar</Text></Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  caja: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 14,
    backgroundColor: C.sup, borderWidth: 1, borderColor: C.acento + '66' },
  titulo: { color: C.texto, fontWeight: '700', fontSize: 15 },
  texto: { color: C.tenue, fontSize: 13 },
  luego: { color: C.tenue, fontWeight: '600' },
  cancelar: { color: C.coral, fontWeight: '600' },
  boton: { backgroundColor: C.acento, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  botonTxt: { color: C.fondo, fontWeight: '800' },
})
