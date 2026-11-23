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
  actualizarModelo,
  escucharProgreso,
  estaGrupoDisponible,
  estaIncluidoEnApk,
  estadoDescargaActual,
  pausarDescarga,
  reanudarDescarga,
  cancelarDescarga,
  nombreVisibleGrupo,
  plantasDeGrupo,
  useActualizacionesModelos,
  ActualizacionModelo,
  INFO_VERIFICADOR,
  descargarVerificador,
  estaVerificadorDisponible,
  tamanoAMostrarGrupo,
} from './gestorModelos'
import { Novedad, verificarParaDescargarModelos } from './actualizacion'
import TarjetaActualizacion from './TarjetaActualizacion'

export default function MisCultivos({ alCambiar }: { alCambiar?: () => void }) {
  const { colores: C, brillo } = useTema()
  const [disponibles, setDisponibles] = useState<Record<string, boolean>>({})
  const [verificadorDisponible, setVerificadorDisponible] = useState(false)
  const [avisoActualizar, setAvisoActualizar] = useState<Novedad | null>(null)
  const [mensajeSinInternet, setMensajeSinInternet] = useState<string | null>(null)
  const [actualizandoTodos, setActualizandoTodos] = useState(false)

  const {
    actualizaciones,
    refrescarActualizaciones,
    tieneActualizacion,
  } = useActualizacionesModelos()

  const cargar = useCallback(async () => {
    const mapa: Record<string, boolean> = {}
    for (const g of GRUPOS_MODELO) {
      mapa[g.id] = await estaGrupoDisponible(g.id)
    }
    setDisponibles(mapa)
    const verOk = await estaVerificadorDisponible()
    setVerificadorDisponible(verOk)
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

  const actualizarTodos = async () => {
    const puede = await validarDescarga()
    if (!puede) return
    setActualizandoTodos(true)
    try {
      for (const act of actualizaciones) {
        try {
          await actualizarModelo(act.grupoId, act)
        } catch (e: any) {
          Alert.alert('Error al actualizar', e?.message ?? `No se pudo actualizar ${act.nombreVisible}`)
        }
      }
      await cargar()
      await refrescarActualizaciones()
    } catch {} finally {
      setActualizandoTodos(false)
    }
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
        <TarjetaActualizacion
          novedad={avisoActualizar}
          onCerrar={() => setAvisoActualizar(null)}
          descripcion="El servidor requiere una versión actualizada de FitoLens antes de incorporar nuevos modelos especialistas."
        />
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

      {/* Aviso de Actualizar todos si hay múltiples cultivos con actualización */}
      {actualizaciones.length > 1 && (
        <View style={[s.tarjetaActualizarTodos, { backgroundColor: C.fondo2, borderColor: C.oro }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.sobre, { color: C.oro }]}>MEJORAS DISPONIBLES</Text>
            <Text style={[s.tituloActualizarTodos, { color: C.texto }]}>
              {actualizaciones.length} cultivos tienen nueva versión
            </Text>
          </View>
          <Pressable
            onPress={actualizarTodos}
            disabled={actualizandoTodos}
            style={({ pressed }) => [
              s.botonActualizarTodos,
              { backgroundColor: C.oro },
              (pressed || actualizandoTodos) && { opacity: 0.75 },
            ]}
          >
            <Text style={[s.botonActualizarTodosTxt, { color: '#000000' }]}>
              {actualizandoTodos ? 'Actualizando…' : 'Actualizar todos'}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={{ gap: 10, marginTop: 4 }}>
        {!verificadorDisponible && (
          <FilaVerificador
            validarAntesDeDescargar={validarDescarga}
            onRefrescar={cargar}
          />
        )}
        {GRUPOS_MODELO.map((g) => (
          <FilaGrupo
            key={g.id}
            grupo={g}
            instalado={!!disponibles[g.id]}
            incluidoEnApk={estaIncluidoEnApk(g.id)}
            actualizacion={tieneActualizacion(g.id)}
            verificadorDisponible={verificadorDisponible}
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
  actualizacion,
  verificadorDisponible,
  validarAntesDeDescargar,
  onRefrescar,
}: {
  grupo: InfoGrupoCultivo
  instalado: boolean
  incluidoEnApk: boolean
  actualizacion: ActualizacionModelo | null
  verificadorDisponible: boolean
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

  const actualizar = async () => {
    const puede = await validarAntesDeDescargar()
    if (!puede) return

    try {
      await actualizarModelo(grupo.id, actualizacion ?? undefined)
      onRefrescar()
    } catch (e: any) {
      Alert.alert('Error al actualizar', e?.message ?? `No se pudo actualizar ${nombreVisibleGrupo(grupo.id)}.`)
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
      `¿Deseas borrar el modelo de ${nombreVisibleGrupo(grupo.id)} (${grupo.tamano_mb} MB) para liberar espacio?`,
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
  const tamanoAMostrar = actualizacion
    ? actualizacion.tamano_mb
    : instalado
    ? grupo.tamano_mb
    : tamanoAMostrarGrupo(grupo.id, verificadorDisponible)

  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: actualizacion ? C.oro : C.borde }]}>
      <View style={s.cabecera}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.nombre, { color: C.texto }]}>{nombreVisibleGrupo(grupo.id)}</Text>
          <Text style={[s.detalles, { color: C.tenue }]}>
            {plantasDeGrupo(grupo.id).join(', ')} · {tamanoAMostrar} MB
          </Text>
        </View>

        {actualizacion && !enDescarga ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={actualizar}
              style={({ pressed }) => [
                s.botonActualizarCultivo,
                { backgroundColor: C.oro },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text style={[s.botonActualizarCultivoTxt, { color: '#000000' }]}>
                Actualizar · {actualizacion.tamano_mb} MB
              </Text>
            </Pressable>
            {instalado && !incluidoEnApk && (
              <Pressable
                onPress={borrar}
                hitSlop={8}
                style={({ pressed }) => [s.botonBorrar, pressed && { opacity: 0.6 }]}
              >
                <Text style={{ color: C.coral, fontSize: 12, fontWeight: '700' }}>Borrar</Text>
              </Pressable>
            )}
          </View>
        ) : incluidoEnApk && !enDescarga ? (
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

      {/* Aviso de nueva versión del modelo */}
      {actualizacion && !enDescarga && (
        <View style={s.filaNuevaVersion}>
          <Text style={{ fontSize: 12 }}>✨</Text>
          <Text style={[s.textoNuevaVersion, { color: C.oro }]}>
            Nueva versión del modelo
          </Text>
        </View>
      )}

      {/* Progreso de descarga activa */}
      {enDescarga && (
        <View style={{ marginTop: 8, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[s.detalles, { color: actualizacion ? C.oro : C.acento, fontWeight: '700' }]}>
              {estado.estado === 'pausada'
                ? 'Descarga en pausa'
                : actualizacion
                ? 'Actualizando modelo…'
                : 'Descargando modelo…'}{' '}
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
                  backgroundColor: estado.estado === 'pausada' ? C.oro : actualizacion ? C.oro : C.acento,
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

function FilaVerificador({
  validarAntesDeDescargar,
  onRefrescar,
}: {
  validarAntesDeDescargar: () => Promise<boolean>
  onRefrescar: () => void
}) {
  const { colores: C } = useTema()
  const [estado, setEstado] = useState(estadoDescargaActual('verificador'))

  useEffect(() => {
    return escucharProgreso((id, est) => {
      if (id === 'verificador') {
        setEstado(est)
        if (est.estado === 'listo') onRefrescar()
      }
    })
  }, [onRefrescar])

  const descargar = async () => {
    const puede = await validarAntesDeDescargar()
    if (!puede) return
    try {
      await descargarVerificador()
      onRefrescar()
    } catch (e: any) {
      Alert.alert('Error al descargar', e?.message ?? 'No se pudo descargar el verificador abierto.')
    }
  }

  const enDescarga = estado.estado === 'descargando' || estado.estado === 'pausada'

  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
      <View style={s.cabecera}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.nombre, { color: C.texto }]}>Verificador abierto (CLIP)</Text>
          <Text style={[s.detalles, { color: C.tenue }]}>
            Filtro de plantas ajenas al catálogo · {INFO_VERIFICADOR.tamano_mb} MB
          </Text>
        </View>

        {!enDescarga ? (
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

      {enDescarga && (
        <View style={{ marginTop: 8, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[s.detalles, { color: C.acento, fontWeight: '700' }]}>
              {estado.estado === 'pausada' ? 'Descarga en pausa' : 'Descargando verificador…'}{' '}
              {Math.round(estado.progreso * 100)} %
            </Text>
            <Pressable onPress={() => cancelarDescarga('verificador')} hitSlop={8}>
              <Text style={{ color: C.coral, fontSize: 13, fontWeight: '700' }}>Cancelar</Text>
            </Pressable>
          </View>
          <View style={[s.pista, { backgroundColor: C.fondo2 }]}>
            <View
              style={[
                s.barra,
                {
                  width: `${Math.round(estado.progreso * 100)}%`,
                  backgroundColor: C.acento,
                },
              ]}
            />
          </View>
        </View>
      )}

      {estado.estado === 'error' && (
        <Text style={{ color: C.coral, fontSize: 12, marginTop: 4 }}>
          {estado.error || 'Ocurrió un error al descargar el verificador.'}
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
  tarjetaActualizarTodos: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginVertical: 4,
  },
  tituloActualizarTodos: {
    fontSize: 14,
    fontWeight: '700',
  },
  botonActualizarTodos: {
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botonActualizarTodosTxt: {
    fontSize: 13,
    fontWeight: '800',
  },
  botonActualizarCultivo: {
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botonActualizarCultivoTxt: {
    fontSize: 12,
    fontWeight: '800',
  },
  filaNuevaVersion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0a80044',
  },
  textoNuevaVersion: {
    fontSize: 12,
    fontWeight: '700',
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
