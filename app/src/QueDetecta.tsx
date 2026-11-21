import { useState } from 'react'
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native'
import { C } from './tema'
import { CULTIVOS, CLASES, esSana } from './catalogo'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

const ORDEN_CULTIVOS = ['cafe', 'cacao', 'papa', 'tomate', 'pimiento', 'maiz', 'limon', 'naranja']

export default function QueDetecta() {
  const [abierto, setAbierto] = useState(false)

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setAbierto(!abierto)
  }

  return (
    <View style={s.tarjeta}>
      <Pressable onPress={toggle} style={s.cabecera} hitSlop={6}>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>Qué detecta FitoLens</Text>
          <Text style={s.subtitulo}>8 cultivos · 28 enfermedades y planta sana</Text>
        </View>
        <Text style={s.flecha}>{abierto ? '▲' : '▼'}</Text>
      </Pressable>

      {abierto && (
        <View style={s.cuerpo}>
          {ORDEN_CULTIVOS.map((id) => {
            const cult = CULTIVOS[id]
            if (!cult) return null
            const clasesCultivo = Object.entries(CLASES).filter(([k]) => k.startsWith(id + '_'))
            return (
              <View key={id} style={[s.grupo, { borderLeftColor: cult.color }]}>
                <View style={s.grupoCab}>
                  <Text style={[s.cultivoNombre, { color: cult.color }]}>{cult.nombre}</Text>
                  <Text style={s.conteo}>{clasesCultivo.length} clases</Text>
                </View>
                <View style={s.lista}>
                  {clasesCultivo.map(([k, c]) => {
                    const sana = esSana(k)
                    return (
                      <View key={k} style={s.item}>
                        <Text style={[s.icono, sana && { color: C.sana }]}>{sana ? '✓' : '•'}</Text>
                        <Text style={[s.itemTxt, sana && { color: C.sana, fontWeight: '600' }]}>{c.nombre}</Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  tarjeta: {
    backgroundColor: C.sup,
    borderWidth: 1,
    borderColor: C.borde,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titulo: {
    color: C.texto,
    fontSize: 16,
    fontWeight: '800',
  },
  subtitulo: {
    color: C.tenue,
    fontSize: 12,
    marginTop: 2,
  },
  flecha: {
    color: C.acento,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  cuerpo: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.borde2,
    gap: 12,
  },
  grupo: {
    backgroundColor: C.fondo2,
    borderWidth: 1,
    borderColor: C.borde,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  grupoCab: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cultivoNombre: {
    fontSize: 15,
    fontWeight: '700',
  },
  conteo: {
    color: C.tenue,
    fontSize: 11,
  },
  lista: {
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icono: {
    color: C.tenue,
    fontSize: 13,
    fontWeight: '700',
  },
  itemTxt: {
    color: C.texto,
    fontSize: 13,
  },
})
