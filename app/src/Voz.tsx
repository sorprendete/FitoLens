import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Speech from 'expo-speech'
import { useTema } from './tema'
import { IDIOMAS, Idioma, textoVoz } from './voz'

// Botón "Escuchar": lee el resultado con la voz del teléfono (funciona sin internet).
export default function Voz({ r, info, sana }: { r: Parameters<typeof textoVoz>[0]; info?: Parameters<typeof textoVoz>[1]; sana?: boolean }) {
  const { colores: C } = useTema()
  const [idioma, setIdioma] = useState<Idioma>('es')
  const [hablando, setHablando] = useState(false)
  useEffect(() => () => { Speech.stop() }, [r])

  function hablar() {
    if (hablando) { Speech.stop(); setHablando(false); return }
    Speech.stop()
    Speech.speak(textoVoz(r, info, sana, idioma), {
      language: 'es-PE', rate: idioma === 'qu' ? 0.85 : 0.95,
      onDone: () => setHablando(false), onStopped: () => setHablando(false), onError: () => setHablando(false),
    })
    setHablando(true)
  }
  const cambiar = (i: Idioma) => { Speech.stop(); setHablando(false); setIdioma(i) }

  return (
    <View style={s.fila}>
      <Pressable onPress={hablar} style={({ pressed }) => [s.boton, { backgroundColor: C.sup2, borderColor: C.borde2 }, pressed && { opacity: 0.6 }]} accessibilityRole="button">
        <Text style={[s.txt, { color: C.texto }]}>{hablando ? '■ Detener' : '🔊 Escuchar resultado'}</Text>
      </Pressable>
      {(Object.keys(IDIOMAS) as Idioma[]).map((k) => (
        <Pressable key={k} onPress={() => cambiar(k)} style={[s.idioma, { borderColor: C.borde }, idioma === k && { borderColor: C.acento, backgroundColor: C.acento + '22' }]}>
          <Text style={[s.txt, { color: idioma === k ? C.acento : C.texto }]}>{IDIOMAS[k]}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  boton: { flexGrow: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  idioma: { minHeight: 48, minWidth: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  txt: { fontWeight: '600', fontSize: 14 },
})
