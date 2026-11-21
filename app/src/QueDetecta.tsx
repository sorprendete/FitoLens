import { useState } from 'react'
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native'
import { useTema } from './tema'
import { CULTIVOS, CLASES, esSana } from './catalogo'
import { useCultivosInstalados } from './gestorModelos'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

const ORDEN_CULTIVOS = ['cafe', 'cacao', 'papa', 'tomate', 'pimiento', 'maiz', 'limon', 'naranja']

export default function QueDetecta({ onIrAMisCultivos }: { onIrAMisCultivos?: () => void }) {
  const { colores: C, brillo } = useTema()
  const [abierto, setAbierto] = useState(false)
  const {
    cultivosInstalados,
    cultivosDisponibles,
    textoDetecta,
    totalInstalados,
    totalGrupos,
    esCultivoInstalado,
  } = useCultivosInstalados()

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setAbierto(!abierto)
  }

  const conteoClasesInstaladas = Object.entries(CLASES).filter(([k]) =>
    cultivosInstalados.some((cId) => k.startsWith(cId + '_'))
  ).length

  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
      <Pressable onPress={toggle} style={s.cabecera} hitSlop={8}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.titulo, { color: C.texto }]}>Qué detecta FitoLens</Text>
          <Text style={[s.subtitulo, { color: C.tenue }]}>
            Detecta: <Text style={{ color: C.acento, fontWeight: '700' }}>{textoDetecta}</Text>
            {totalInstalados < totalGrupos
              ? ` (${conteoClasesInstaladas} enf. offline) · ${cultivosDisponibles.length} por descargar`
              : ' · 28 enfermedades y planta sana'}
          </Text>
        </View>
        <Text style={[s.flecha, { color: C.acento }]}>{abierto ? '▲' : '▼'}</Text>
      </Pressable>

      {abierto && (
        <View style={[s.cuerpo, { borderTopColor: C.borde2 }]}>
          {/* 1. Cultivos con modelo instalado */}
          {cultivosInstalados.length > 0 && (
            <View style={{ gap: 10 }}>
              <Text style={[s.seccionRotulo, { color: C.sana }]}>
                ✓ Listos para diagnosticar en el teléfono (sin internet)
              </Text>
              {ORDEN_CULTIVOS.filter((id) => esCultivoInstalado(id)).map((id) => {
                const cult = CULTIVOS[id]
                if (!cult) return null
                const clasesCultivo = Object.entries(CLASES).filter(([k]) => k.startsWith(id + '_'))
                return (
                  <View key={id} style={[s.grupo, { backgroundColor: C.fondo2, borderColor: C.borde, borderLeftColor: cult.color }]}>
                    <View style={s.grupoCab}>
                      <Text style={[s.cultivoNombre, { color: cult.color }]}>{cult.nombre}</Text>
                      <Text style={[s.conteo, { color: C.tenue }]}>{clasesCultivo.length} clases offline</Text>
                    </View>
                    <View style={s.lista}>
                      {clasesCultivo.map(([k, c]) => {
                        const sana = esSana(k)
                        return (
                          <View key={k} style={s.item}>
                            <Text style={[s.icono, { color: sana ? C.sana : C.tenue }]}>{sana ? '✓' : '•'}</Text>
                            <Text style={[s.itemTxt, { color: sana ? C.sana : C.texto }, sana && { fontWeight: '600' }]}>{c.nombre}</Text>
                          </View>
                        )
                      })}
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          {/* 2. Cultivos pendientes de descarga */}
          {cultivosDisponibles.length > 0 && (
            <View style={[s.disponiblesCaja, { backgroundColor: C.fondo2, borderColor: C.borde2 }]}>
              <View style={{ gap: 4 }}>
                <Text style={[s.disponiblesTitulo, { color: C.oro }]}>
                  Disponible para descargar ({cultivosDisponibles.length} cultivos)
                </Text>
                <Text style={[s.disponiblesDesc, { color: C.tenue }]}>
                  Estos modelos están listos para descargarse cuando los necesites en la chacra:
                </Text>
              </View>

              <View style={s.chipsFila}>
                {cultivosDisponibles.map((id) => {
                  const cult = CULTIVOS[id]
                  if (!cult) return null
                  const cant = Object.keys(CLASES).filter((k) => k.startsWith(id + '_')).length
                  return (
                    <View key={id} style={[s.chipDisp, { borderColor: C.borde2, backgroundColor: C.sup }]}>
                      <Text style={{ color: C.texto, fontSize: 12, fontWeight: '700' }}>{cult.nombre}</Text>
                      <Text style={{ color: C.tenue, fontSize: 11 }}>({cant} clases)</Text>
                    </View>
                  )
                })}
              </View>

              {onIrAMisCultivos && (
                <Pressable
                  onPress={onIrAMisCultivos}
                  style={({ pressed }) => [
                    s.botonIrCultivos,
                    { backgroundColor: C.acento },
                    brillo(C.acento),
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[s.botonIrCultivosTxt, { color: C.textoBotonAcento }]}>
                    📥 Descargar en Mis cultivos
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  tarjeta: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
  },
  titulo: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitulo: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18,
  },
  flecha: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  cuerpo: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 14,
  },
  seccionRotulo: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  grupo: {
    borderWidth: 1,
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
    fontSize: 11,
  },
  lista: {
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 24,
  },
  icono: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemTxt: {
    fontSize: 13,
  },
  disponiblesCaja: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  disponiblesTitulo: {
    fontSize: 14,
    fontWeight: '800',
  },
  disponiblesDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  chipsFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipDisp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  botonIrCultivos: {
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 14,
  },
  botonIrCultivosTxt: {
    fontSize: 13,
    fontWeight: '800',
  },
})
