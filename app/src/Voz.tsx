import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Speech from 'expo-speech'
import { C } from './tema'
import { IDIOMAS, Idioma, textoVoz } from './voz'

// Botón "Escuchar": lee el resultado con la voz del teléfono (funciona sin internet).
export default function Voz({ r, info, sana }: { r: Parameters<typeof textoVoz>[0]; info?: Parameters<typeof textoVoz>[1]; sana?: boolean }) {
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
      <Pressable onPress={hablar} style={({ pressed }) => [s.boton, pressed && { opacity: 0.6 }]} accessibilityRole="button">
        <Text style={s.txt}>{hablando ? '■ Detener' : '🔊 Escuchar resultado'}</Text>
      </Pressable>
      {(Object.keys(IDIOMAS) as Idioma[]).map((k) => (
        <Pressable key={k} onPress={() => cambiar(k)} style={[s.idioma, idioma === k && { borderColor: C.acento }]}>
          <Text style={[s.txt, idioma === k && { color: C.acento }]}>{IDIOMAS[k]}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  boton: { flexGrow: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: C.borde2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: C.sup2 },
  idioma: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: C.borde, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  txt: { color: C.texto, fontWeight: '600' },
})
