// Foto analizada con interruptor "Foto original / Visión de la IA" (igual que web/src/componentes/MapaCalor.jsx):
// mapa de calor encima de la foto, contorno de la hoja ubicada, intensidad y leyenda azul → rojo.
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg'
import { C } from './tema'
import type { Vision } from './ia'

const INTENSIDAD = [{ t: 'Suave', v: 0.45 }, { t: 'Media', v: 0.75 }, { t: 'Fuerte', v: 1 }]

export default function VisionIA({ foto, proporcion, vision, cargando }: { foto: string; proporcion: number; vision?: Vision | null; cargando?: boolean }) {
  const [ver, setVer] = useState(true)
  const [nivel, setNivel] = useState(1)
  useEffect(() => { setVer(true) }, [vision])
  const calor = vision?.calor, polis = vision?.contorno ?? []
  const mostrar = !!calor && ver

  return (
    <View style={{ gap: 10 }}>
      {calor && (
        <View style={s.segmentado} accessibilityRole="tablist">
          {[['Foto original', false], ['Visión de la IA', true]].map(([t, v]) => (
            <Pressable key={String(t)} onPress={() => setVer(v as boolean)} style={[s.opcion, ver === v && s.opcionActiva]} accessibilityState={{ selected: ver === v }}>
              <Text style={[s.opcionTxt, ver === v && { color: C.fondo }]}>{t as string}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={[s.marco, { aspectRatio: proporcion }]}>
        <Image source={{ uri: foto }} style={StyleSheet.absoluteFill} resizeMode="stretch" accessibilityLabel="Foto analizada" />
        {calor && <Image source={{ uri: `data:image/png;base64,${calor}` }} style={[StyleSheet.absoluteFill, { opacity: mostrar ? INTENSIDAD[nivel].v : 0 }]}
          resizeMode="stretch" accessibilityLabel="Mapa de calor: zonas que más pesaron en la decisión" />}
        {polis.length > 0 && ver && (
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {polis.map((pol, i) => (
              <Polygon key={i} points={pol.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')} fill="none" stroke={C.acento}
                strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
          </Svg>
        )}
        {cargando && <Escaner />}
      </View>
      {mostrar && (
        <View style={{ gap: 8 }}>
          <View style={s.leyenda}>
            <Text style={s.tenue}>Lo ignoró</Text>
            <Svg height={10} style={{ flex: 1 }}>
              <Defs>
                <LinearGradient id="g" x1="0" y1="0" x2="1" y2="0">
                  {['#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff0000'].map((c, i) => <Stop key={c} offset={i / 4} stopColor={c} />)}
                </LinearGradient>
              </Defs>
              <Rect width="100%" height={10} rx={5} fill="url(#g)" />
            </Svg>
            <Text style={s.tenue}>Lo que más miró</Text>
          </View>
          <View style={s.leyenda}>
            <Text style={s.tenue}>Intensidad</Text>
            {INTENSIDAD.map((x, i) => (
              <Pressable key={x.t} onPress={() => setNivel(i)} style={[s.chip, nivel === i && { borderColor: C.acento }]}>
                <Text style={[s.chipTxt, nivel === i && { color: C.acento }]}>{x.t}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.tenue}>
            El color muestra qué zonas de la foto pesaron más en la decisión (Grad-CAM).{polis.length ? ' La línea marca la hoja que ubicó.' : ''} Si el rojo cae fuera de la lesión, repite la foto.
          </Text>
        </View>
      )}
    </View>
  )
}

// Línea que recorre la foto mientras se analiza.
function Escaner() {
  const a = useRef(new Animated.Value(0)).current
  const [alto, setAlto] = useState(0)
  useEffect(() => {
    const bucle = Animated.loop(Animated.timing(a, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }))
    bucle.start()
    return () => bucle.stop()
  }, [a])
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setAlto(e.nativeEvent.layout.height)} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.fondo + '55' }]} />
      <Animated.View style={[s.linea, { transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, alto - 3)] }) }] }]} />
    </View>
  )
}

const s = StyleSheet.create({
  marco: { width: '100%', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.borde2, backgroundColor: C.fondo2 },
  segmentado: { flexDirection: 'row', backgroundColor: C.fondo2, borderRadius: 14, borderWidth: 1, borderColor: C.borde, padding: 4 },
  opcion: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  opcionActiva: { backgroundColor: C.acento },
  opcionTxt: { color: C.texto, fontWeight: '700', fontSize: 15 },
  leyenda: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tenue: { color: C.tenue, fontSize: 13, lineHeight: 19 },
  chip: { borderWidth: 1, borderColor: C.borde2, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
  chipTxt: { color: C.texto, fontSize: 13, fontWeight: '600' },
  linea: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: C.acento, shadowColor: C.acento, shadowOpacity: 0.9, shadowRadius: 10, elevation: 8 },
})
