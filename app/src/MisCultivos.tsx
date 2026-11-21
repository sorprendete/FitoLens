// Componente de administración de modelos de cultivo: descargar, pausar, reanudar o borrar modelos locales.
import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTema } from './tema'
import {
  GRUPOS_MODELO,
  InfoGrupoCultivo,
  alCambiarModelos,
  borrarModeloDescargado,
  descargarGrupo,
  escucharProgreso,
  estaGrupoDisponible,
  estaIncluidoEnApk,
  estadoDescargaActual,
  pausarDescarga,
  reanudarDescarga,
  cancelarDescarga,
} from './gestorModelos'
import { Novedad, instalarActualizacion, verificarParaDescargarModelos } from './actualizacion'

export default function MisCultivos({ alCambiar }: { alCambiar?: () => void }) {
  const { colores: C, brillo } = useTema()
  const [disponibles, setDisponibles] = useState<Record<string, boolean>>({})
  const [avisoActualizar, setAvisoActualizar] = useState<Novedad | null>(null)
  const [mensajeSinInternet, setMensajeSinInternet] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const mapa: Record<string, boolean> = {}
    for (const g of GRUPOS_MODELO) {
      mapa[g.id] = await estaGrupoDisponible(g.id)
    }
    setDisponibles(mapa)
    alCambiar?.()
  }, [alCambiar])

  useEffect(() => {
    cargar()
    return alCambiarModelos(cargar)
  }, [cargar])

  const validarDescarga = async (): Promise<boolean> => {
    setAvisoActualizar(null)
    setMensajeSinInternet(null)
    const v = await verificarParaDescargarModelos()
    if (!v.puedeDescargar) {
      if (v.sinInternet) {
        setMensajeSinInternet(v.mensaje ?? 'Sin internet no se pueden descargar modelos nuevos. Los modelos ya descargados siguen funcionando sin internet.')
        return false
      }
      if (v.requiereActualizacion && v.novedad) {
        setAvisoActualizar(v.novedad)
        return false
      }
    }
    return true
  }

  return (
    <View style={s.contenedor}>
      <Text style={[s.sobre, { color: C.acento }]}>MODELOS DE DIAGNÓSTICO OFFLINE</Text>
      <Text style={[s.titulo, { color: C.texto }]}>Mis cultivos instalados</Text>
      <Text style={[s.tenue, { color: C.tenue }]}>
        El clasificador central va incluido. Descarga los especialistas que necesites para diagnosticar sin señal en campo.
      </Text>

      {/* Aviso de actualización requerida para descargar */}
      {avisoActualizar && (
        <View style={[s.tarjetaAlerta, { backgroundColor: C.fondo2, borderColor: C.acento }, brillo(C.acento)]}>
          <Text style={[s.sobre, { color: C.acento }]}>ACTUALIZACIÓN REQUERIDA</Text>
          <Text style={[s.alertaTitulo, { color: C.texto }]}>
            Para agregar cultivos primero actualiza la app a la {avisoActualizar.version}
          </Text>
          <Text style={[s.tenue, { color: C.tenue }]}>
            El servidor requiere una versión actualizada de FitoLens antes de incorporar nuevos modelos especialistas.
          </Text>
          <View style={s.filaBotones}>
            <Pressable
              onPress={() => instalarActualizacion(avisoActualizar)}
              style={({ pressed }) => [
                s.botonActualizar,
                { backgroundColor: C.acento },
                brillo(C.acento),
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[s.botonActualizarTxt, { color: C.textoBotonAcento }]}>Actualizar</Text>
            </Pressable>
            <Pressable onPress={() => setAvisoActualizar(null)} style={s.accionBtn}>
              <Text style={{ color: C.tenue, fontWeight: '600' }}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Aviso de sin internet */}
      {mensajeSinInternet && (
        <View style={[s.tarjetaAlerta, { backgroundColor: C.fondo2, borderColor: C.coral }]}>
          <Text style={[s.sobre, { color: C.coral }]}>SIN INTERNET</Text>
          <Text style={[s.tenue, { color: C.texto }]}>{mensajeSinInternet}</Text>
          <Pressable onPress={() => setMensajeSinInternet(null)} style={s.accionBtn}>
            <Text style={{ color: C.coral, fontWeight: '700' }}>Entendido</Text>
          </Pressable>
        </View>
      )}

      <View style={{ gap: 10, marginTop: 4 }}>
        {GRUPOS_MODELO.map((g) => (
          <FilaGrupo
            key={g.id}
            grupo={g}
            instalado={!!disponibles[g.id]}
            incluidoEnApk={estaIncluidoEnApk(g.id)}
            validarAntesDeDescargar={validarDescarga}
            onRefrescar={cargar}
          />
        ))}
      </View>
    </View>
  )
}

function FilaGrupo({
  grupo,
  instalado,
  incluidoEnApk,
  validarAntesDeDescargar,
  onRefrescar,
}: {
  grupo: InfoGrupoCultivo
  instalado: boolean
  incluidoEnApk: boolean
  validarAntesDeDescargar: () => Promise<boolean>
  onRefrescar: () => void
}) {
  const { colores: C } = useTema()
  const [estado, setEstado] = useState(estadoDescargaActual(grupo.id))

  useEffect(() => {
    return escucharProgreso((id, est) => {
      if (id === grupo.id) {
        setEstado(est)
        if (est.estado === 'listo') onRefrescar()
      }
    })
  }, [grupo.id, onRefrescar])

  const descargar = async () => {
    const puede = await validarAntesDeDescargar()
    if (!puede) return

    try {
      await descargarGrupo(grupo.id)
    } catch (e: any) {
      Alert.alert('Error al descargar', e?.message ?? 'No se pudo descargar el modelo.')
    }
  }

  const reanudar = async () => {
    const puede = await validarAntesDeDescargar()
    if (!puede) return
    await reanudarDescarga(grupo.id)
  }

  const borrar = () => {
    Alert.alert(
      'Borrar modelo',
      `¿Deseas borrar el modelo de ${grupo.nombre} (${grupo.tamano_mb} MB) para liberar espacio?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            await borrarModeloDescargado(grupo.id)
            onRefrescar()
          },
        },
      ]
    )
  }

  const enDescarga = estado.estado === 'descargando' || estado.estado === 'pausada'

  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
      <View style={s.cabecera}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.nombre, { color: C.texto }]}>{grupo.nombre}</Text>
          <Text style={[s.detalles, { color: C.tenue }]}>
            {grupo.cultivos.join(', ')} · {grupo.tamano_mb} MB
          </Text>
        </View>

        {incluidoEnApk ? (
          <View style={[s.chip, { borderColor: C.sana + '66', backgroundColor: C.sana + '18' }]}>
            <Text style={{ color: C.sana, fontSize: 12, fontWeight: '700' }}>Incluido en app</Text>
          </View>
        ) : instalado && !enDescarga ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[s.chip, { borderColor: C.acento + '66', backgroundColor: C.acento + '18' }]}>
              <Text style={{ color: C.acento, fontSize: 12, fontWeight: '700' }}>Listo offline</Text>
            </View>
            <Pressable
              onPress={borrar}
              hitSlop={8}
              style={({ pressed }) => [s.botonBorrar, pressed && { opacity: 0.6 }]}
            >
              <Text style={{ color: C.coral, fontSize: 12, fontWeight: '700' }}>Borrar</Text>
            </Pressable>
          </View>
        ) : !enDescarga ? (
          <Pressable
            onPress={descargar}
            style={({ pressed }) => [
              s.botonDescargar,
              { backgroundColor: C.acento },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[s.botonDescargarTxt, { color: C.textoBotonAcento }]}>Descargar</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Progreso de descarga activa */}
      {enDescarga && (
        <View style={{ marginTop: 8, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[s.detalles, { color: C.acento, fontWeight: '700' }]}>
              {estado.estado === 'pausada' ? 'Descarga en pausa' : 'Descargando modelo…'}{' '}
              {Math.round(estado.progreso * 100)} %
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {estado.estado === 'descargando' ? (
                <Pressable onPress={() => pausarDescarga(grupo.id)} hitSlop={8}>
                  <Text style={{ color: C.oro, fontSize: 13, fontWeight: '700' }}>Pausar</Text>
                </Pressable>
              ) : (
                <Pressable onPress={reanudar} hitSlop={8}>
                  <Text style={{ color: C.acento, fontSize: 13, fontWeight: '700' }}>Reanudar</Text>
                </Pressable>
              )}
              <Pressable onPress={() => cancelarDescarga(grupo.id)} hitSlop={8}>
                <Text style={{ color: C.coral, fontSize: 13, fontWeight: '700' }}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
          <View style={[s.pista, { backgroundColor: C.fondo2 }]}>
            <View
              style={[
                s.barra,
                {
                  width: `${Math.round(estado.progreso * 100)}%`,
                  backgroundColor: estado.estado === 'pausada' ? C.oro : C.acento,
                },
              ]}
            />
          </View>
        </View>
      )}

      {estado.estado === 'error' && (
        <Text style={{ color: C.coral, fontSize: 12, marginTop: 4 }}>
          {estado.error || 'Ocurrió un error al descargar.'}
        </Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  contenedor: { gap: 8 },
  sobre: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  titulo: { fontSize: 18, fontWeight: '800' },
  tenue: { fontSize: 13, lineHeight: 18 },
  tarjeta: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  tarjetaAlerta: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    marginVertical: 4,
  },
  alertaTitulo: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  filaBotones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  botonActualizar: {
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botonActualizarTxt: {
    fontSize: 13,
    fontWeight: '800',
  },
  accionBtn: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nombre: { fontSize: 15, fontWeight: '700' },
  detalles: { fontSize: 12 },
  chip: {
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  botonDescargar: {
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botonDescargarTxt: {
    fontSize: 13,
    fontWeight: '800',
  },
  botonBorrar: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  pista: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barra: {
    height: '100%',
    borderRadius: 3,
  },
})
