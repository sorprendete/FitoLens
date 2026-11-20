import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { C } from './tema'
import { Novedad, VERSION_APP, buscarActualizacion, instalarActualizacion } from './actualizacion'

const CADA = 60 * 60 * 1000 // como mucho una consulta por hora

// Franja arriba de la app: "Hay una versión nueva" + Actualizar. Solo aparece con internet y en Android.
export default function AvisoActualizacion() {
  const [nueva, setNueva] = useState<Novedad | null>(null)
  const [avance, setAvance] = useState<number | null>(null)
  const [oculto, setOculto] = useState(false)
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

  if (!nueva || oculto) return null
  const actualizar = async () => {
    setAvance(0)
    try { await instalarActualizacion(setAvance) } finally { setAvance(null) }
  }
  return (
    <View style={s.caja}>
      <View style={{ flex: 1 }}>
        <Text style={s.titulo}>Nueva versión {nueva.version}</Text>
        <Text style={s.texto}>
          {avance !== null ? `Descargando… ${Math.round(avance * 100)} %`
            : nueva.notas || `Tienes la ${VERSION_APP}.${nueva.tamano_mb ? ` Descarga de ${nueva.tamano_mb} MB.` : ''}`}
        </Text>
      </View>
      {avance !== null ? <ActivityIndicator color={C.acento} /> : (
        <>
          <Pressable onPress={() => setOculto(true)} hitSlop={8}><Text style={s.luego}>Luego</Text></Pressable>
          <Pressable onPress={actualizar} style={s.boton}><Text style={s.botonTxt}>Actualizar</Text></Pressable>
        </>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  caja: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 14,
    backgroundColor: C.sup, borderWidth: 1, borderColor: C.acento + '66' },
  titulo: { color: C.texto, fontWeight: '700', fontSize: 15 },
  texto: { color: C.tenue, fontSize: 13 },
  luego: { color: C.tenue, fontWeight: '600' },
  boton: { backgroundColor: C.acento, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  botonTxt: { color: C.fondo, fontWeight: '800' },
})
