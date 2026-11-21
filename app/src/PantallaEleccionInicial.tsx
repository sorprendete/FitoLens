// Pantalla inicial para elegir cultivos en la variante liviana de la app.
import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTema } from './tema'
import {
  GRUPOS_MODELO,
  GrupoModeloId,
  descargarGrupo,
  marcarSetupInicialCompletado,
} from './gestorModelos'
import { Novedad, verificarParaDescargarModelos } from './actualizacion'
import TarjetaActualizacion from './TarjetaActualizacion'
import MisCultivos from './MisCultivos'

export default function PantallaEleccionInicial({
  visible,
  alTerminar,
}: {
  visible: boolean
  alTerminar: () => void
}) {
  const { colores: C, brillo, esOscuro } = useTema()
  const [seleccionados, setSeleccionados] = useState<Record<GrupoModeloId, boolean>>({
    cafe: true,
    cacao: true,
    hortalizas: false,
    citricos: false,
    maiz: false,
  })
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actualizacionReq, setActualizacionReq] = useState<Novedad | null>(null)

  const toggle = (id: GrupoModeloId) => {
    setSeleccionados((s) => ({ ...s, [id]: !s[id] }))
  }

  const tamanoTotal = GRUPOS_MODELO.filter((g) => seleccionados[g.id])
    .reduce((acc, g) => acc + g.tamano_mb, 0)
    .toFixed(1)

  const iniciarDescargas = async () => {
    setError(null)
    setActualizacionReq(null)

    try {
      // (C) Verificar si la app está al día antes de descargar modelos
      const v = await verificarParaDescargarModelos()
      if (!v.puedeDescargar) {
        if (v.sinInternet) {
          setError(v.mensaje ?? 'Sin internet no se pueden descargar modelos nuevos. Los modelos ya descargados siguen funcionando sin internet.')
          return
        }
        if (v.requiereActualizacion && v.novedad) {
          setActualizacionReq(v.novedad)
          return
        }
      }

      setDescargando(true)
      const elegidos = GRUPOS_MODELO.filter((g) => seleccionados[g.id])
      for (const g of elegidos) {
        await descargarGrupo(g.id).catch(() => {})
      }
      await marcarSetupInicialCompletado()
      alTerminar()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudieron descargar algunos modelos.')
    } finally {
      setDescargando(false)
    }
  }

  const omitir = async () => {
    try {
      await marcarSetupInicialCompletado()
    } catch {}
    alTerminar()
  }

  if (!visible) return null

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={[s.raiz, { backgroundColor: C.fondo }]}>
        <ScrollView contentContainerStyle={s.contenido}>
          <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }, brillo(C.acento)]}>
            <Text style={[s.sobre, { color: C.acento }]}>BIENVENIDO A FITOLENS</Text>
            <Text style={[s.titulo, { color: C.texto }]}>Elige tus cultivos</Text>
            <Text style={[s.tenue, { color: C.tenue }]}>
              Esta versión ligera te permite descargar solo los cultivos que siembras o asesoras, ahorrando memoria en tu teléfono.
            </Text>
            <Text style={[s.tenue, { color: C.tenue }]}>
              Una vez descargados, diagnostican 100% sin señal ni internet en la chacra.
            </Text>
          </View>

          {/* Banner de actualización si la app no está al día */}
          {actualizacionReq && (
            <TarjetaActualizacion novedad={actualizacionReq} />
          )}

          {!descargando ? (
            <>
              <View style={{ gap: 10 }}>
                {GRUPOS_MODELO.map((g) => {
                  const marcado = !!seleccionados[g.id]
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => toggle(g.id)}
                      style={[
                        s.opcion,
                        {
                          backgroundColor: marcado ? C.fondo2 : C.sup,
                          borderColor: marcado ? C.acento : C.borde,
                        },
                      ]}
                    >
                      <View
                        style={[
                          s.checkbox,
                          {
                            borderColor: marcado ? C.acento : C.borde2,
                            backgroundColor: marcado ? C.acento : 'transparent',
                          },
                        ]}
                      >
                        {marcado && <Text style={{ color: C.textoBotonAcento, fontWeight: '800', fontSize: 13 }}>✓</Text>}
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[s.opcionTitulo, { color: C.texto }]}>{g.nombre}</Text>
                        <Text style={[s.opcionDetalle, { color: C.tenue }]}>
                          {g.cultivos.join(', ')}
                        </Text>
                      </View>
                      <Text style={[s.tamano, { color: C.tenue }]}>{g.tamano_mb} MB</Text>
                    </Pressable>
                  )
                })}
              </View>

              <View style={[s.totalFila, { borderColor: C.borde }]}>
                <Text style={[s.totalTxt, { color: C.texto }]}>Descarga total seleccionada:</Text>
                <Text style={[s.totalMB, { color: C.acento }]}>{tamanoTotal} MB</Text>
              </View>

              {error && (
                <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.coral }]}>
                  <Text style={{ color: C.coral, fontSize: 13, lineHeight: 18 }}>{error}</Text>
                </View>
              )}

              <View style={s.botones}>
                <Pressable
                  onPress={iniciarDescargas}
                  style={({ pressed }) => [
                    s.botonPrincipal,
                    { backgroundColor: C.acento },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[s.botonPrincipalTxt, { color: C.textoBotonAcento }]}>
                    Descargar seleccionados
                  </Text>
                </Pressable>

                <Pressable
                  onPress={omitir}
                  style={({ pressed }) => [
                    s.botonSecundario,
                    { borderColor: C.borde2 },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text style={[s.botonSecundarioTxt, { color: C.tenue }]}>
                    Configurar después en Ajustes
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={{ gap: 14 }}>
              <MisCultivos alCambiar={() => {}} />
              <Pressable
                onPress={omitir}
                style={[s.botonPrincipal, { backgroundColor: C.acento, marginTop: 10 }]}
              >
                <Text style={[s.botonPrincipalTxt, { color: C.textoBotonAcento }]}>Entrar a la app</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1 },
  contenido: { padding: 18, gap: 16, paddingBottom: 40 },
  tarjeta: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  sobre: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  titulo: { fontSize: 24, fontWeight: '800' },
  tenue: { fontSize: 14, lineHeight: 20 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    minHeight: 56,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  opcionTitulo: { fontSize: 16, fontWeight: '700' },
  opcionDetalle: { fontSize: 13 },
  tamano: { fontSize: 13, fontWeight: '700' },
  totalFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  totalTxt: { fontSize: 14, fontWeight: '600' },
  totalMB: { fontSize: 16, fontWeight: '800' },
  botones: { gap: 10, marginTop: 8 },
  botonPrincipal: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  botonPrincipalTxt: { fontSize: 16, fontWeight: '800' },
  botonSecundario: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  botonSecundarioTxt: { fontSize: 14, fontWeight: '600' },
})
