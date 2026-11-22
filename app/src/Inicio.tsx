// Pantalla de Inicio: primera pestaña con saludo, diagnóstico directo, resumen local, cultivos instalados y alertas de parcelas.
import { useCallback, useEffect, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTema } from './tema'
import { Fila, listar } from './historial'
import { cuentaActual } from './cuenta'
import { Parcela, Visita, listarParcelas, visitas, SEVERIDAD } from './parcelas'
import { CULTIVOS, esSana, infoClase } from './catalogo'
import { GRUPOS_MODELO, plantasDeGrupo, useCultivosInstalados, useActualizacionesModelos } from './gestorModelos'

export default function Inicio({
  onDiagnosticar,
  onVerHistorial,
  onVerParcelas,
  onGestionarCultivos,
}: {
  onDiagnosticar: () => void
  onVerHistorial: () => void
  onVerParcelas: () => void
  onGestionarCultivos: () => void
}) {
  const { colores: C, brillo } = useTema()
  const [historial, setHistorial] = useState<Fila[]>([])
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [alertasParcelas, setAlertasParcelas] = useState<{ parcela: Parcela; visita: Visita }[]>([])
  const {
    gruposInstalados,
    gruposDisponibles,
    textoDetecta,
    totalInstalados,
    totalGrupos,
    esGrupoInstalado,
  } = useCultivosInstalados()
  const { actualizaciones } = useActualizacionesModelos()

  const cargarDatos = useCallback(() => {
    try {
      // 1. Historial local (SQLite)
      const filas = listar()
      setHistorial(filas || [])

      // 2. Parcelas y alertas si hay sesión
      const conCuenta = !!cuentaActual()
      if (conCuenta) {
        const parcs = listarParcelas() || []
        setParcelas(parcs)

        const alertas: { parcela: Parcela; visita: Visita }[] = []
        for (const p of parcs) {
          try {
            const v = visitas(p.id) || []
            if (v.length > 0) {
              const ult = v[v.length - 1]
              if (ult && ult.severidad >= 2) {
                alertas.push({ parcela: p, visita: ult })
              }
            }
          } catch {}
        }
        setAlertasParcelas(alertas)
      } else {
        setParcelas([])
        setAlertasParcelas([])
      }
    } catch {
      setHistorial([])
      setParcelas([])
      setAlertasParcelas([])
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // Saludo según la hora
  const hora = new Date().getHours()
  const saludoHora = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const cuenta = cuentaActual()
  const nombreUsuario = cuenta?.nombre ? cuenta.nombre.split(' ')[0] : 'agricultor'

  // Enfermedad más frecuente en el historial local
  const enfermedadesConteo: Record<string, { nombre: string; total: number }> = {}
  for (const f of historial) {
    if (f.estado === 'diagnostico' && f.clase && !esSana(f.clase)) {
      const info = infoClase(f.clase, f.etiqueta)
      if (!enfermedadesConteo[f.clase]) {
        enfermedadesConteo[f.clase] = { nombre: info.nombre, total: 0 }
      }
      enfermedadesConteo[f.clase].total++
    }
  }
  const enfOrdenadas = Object.values(enfermedadesConteo).sort((a, b) => b.total - a.total)
  const masFrecuente = enfOrdenadas[0]

  return (
    <ScrollView contentContainerStyle={s.contenido}>
      {/* 1. Saludo personalizado */}
      <View style={s.saludoBloque}>
        <Text style={[s.sobre, { color: C.acento }]}>PANEL DE CONTROL</Text>
        <Text style={[s.saludoTxt, { color: C.texto }]}>
          {saludoHora}, <Text style={{ color: C.acento }}>{nombreUsuario}</Text> 👋
        </Text>
        <Text style={[s.subtitulo, { color: C.tenue }]}>
          {totalInstalados === totalGrupos
            ? 'Diagnóstico fitosanitario en campo, 100% sin internet para todos los cultivos.'
            : `Detecta en este teléfono: ${textoDetecta}. Los demás cultivos están disponibles para descargar.`}
        </Text>
      </View>

      {/* 2. Botón grande y destacado Diagnosticar */}
      <Pressable
        onPress={onDiagnosticar}
        style={({ pressed }) => [
          s.botonDiagnosticar,
          { backgroundColor: C.sup, borderColor: C.acento },
          brillo(C.acento),
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={[s.iconoDiagnosticar, { backgroundColor: C.acento + '22' }]}>
          <Text style={{ fontSize: 30 }}>📸</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.diagnosticarTitulo, { color: C.texto }]}>Diagnosticar planta</Text>
          <Text style={[s.diagnosticarSub, { color: C.tenue }]}>
            Toma o sube una foto de una hoja o mazorca
          </Text>
        </View>
        <Text style={{ color: C.acento, fontSize: 24, fontWeight: '700' }}>›</Text>
      </Pressable>

      {/* Aviso pequeño de mejoras para cultivos */}
      {actualizaciones.length > 0 && (
        <Pressable
          onPress={onGestionarCultivos}
          style={({ pressed }) => [
            s.avisoMejoras,
            { backgroundColor: C.oro + '18', borderColor: C.oro + '66' },
            pressed && { opacity: 0.75 },
          ]}
        >
          <View style={s.avisoMejorasFila}>
            <Text style={{ fontSize: 16 }}>✨</Text>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={[s.avisoMejorasTitulo, { color: C.texto }]}>
                Hay mejoras para tus cultivos
              </Text>
              <Text style={[s.avisoMejorasSub, { color: C.tenue }]}>
                {actualizaciones.length === 1
                  ? `Nueva versión del modelo disponible para ${actualizaciones[0].nombreVisible}.`
                  : `Nuevas versiones disponibles para ${actualizaciones.length} cultivos.`}
              </Text>
            </View>
            <Text style={{ color: C.oro, fontWeight: '700', fontSize: 13 }}>Mis cultivos ›</Text>
          </View>
        </Pressable>
      )}

      {/* 3. Cultivos instalados vs disponibles */}
      <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
        <View style={s.tarjetaCabecera}>
          <View style={{ flex: 1 }}>
            <Text style={[s.tarjetaTitulo, { color: C.texto }]}>Cultivos offline listos</Text>
            <Text style={[s.tenue, { color: C.acento, fontWeight: '700', fontSize: 13, marginTop: 1 }]}>
              Detecta: {textoDetecta}
            </Text>
          </View>
          <Pressable onPress={onGestionarCultivos} hitSlop={8}>
            <Text style={{ color: C.acento, fontSize: 13, fontWeight: '700' }}>Administrar ›</Text>
          </Pressable>
        </View>

        <Text style={[s.tenue, { color: C.tenue }]}>
          {totalInstalados} de {totalGrupos} modelos especialistas listos en este teléfono:
        </Text>

        <View style={s.chipsFila}>
          {GRUPOS_MODELO.flatMap((g) => {
            const instalado = esGrupoInstalado(g.id)
            return plantasDeGrupo(g.id).map((planta) => ({
              key: `${g.id}_${planta}`,
              nombre: planta,
              instalado,
            }))
          }).map((item) => (
            <View
              key={item.key}
              style={[
                s.chip,
                {
                  borderColor: item.instalado ? C.sana : C.borde2,
                  backgroundColor: item.instalado ? C.sana + '18' : C.fondo2,
                },
              ]}
            >
              <Text
                style={{
                  color: item.instalado ? C.sana : C.tenue,
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                {item.instalado ? '✓ ' : '○ '}
                {item.nombre}
              </Text>
            </View>
          ))}
        </View>

        {gruposDisponibles.length > 0 && (
          <Pressable
            onPress={onGestionarCultivos}
            style={({ pressed }) => [
              s.botonAgregarMas,
              { borderColor: C.acento, backgroundColor: C.acento + '14' },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={{ color: C.acento, fontSize: 13, fontWeight: '700' }}>
              + Descargar más cultivos ({gruposDisponibles.length} disponibles)
            </Text>
          </Pressable>
        )}
      </View>

      {/* 4. Resumen del Historial local */}
      <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
        <View style={s.tarjetaCabecera}>
          <Text style={[s.tarjetaTitulo, { color: C.texto }]}>Resumen de diagnósticos</Text>
          <Pressable onPress={onVerHistorial} hitSlop={8}>
            <Text style={{ color: C.acento, fontSize: 13, fontWeight: '700' }}>Ver todo ({historial.length}) ›</Text>
          </Pressable>
        </View>

        <View style={s.metricasFila}>
          <View style={[s.metricaCaja, { backgroundColor: C.fondo2 }]}>
            <Text style={[s.metricaNum, { color: C.acento }]}>{historial.length}</Text>
            <Text style={[s.metricaEtq, { color: C.tenue }]}>Total local</Text>
          </View>
          <View style={[s.metricaCaja, { backgroundColor: C.fondo2, flex: 2 }]}>
            <Text style={[s.metricaSub, { color: C.texto }]} numberOfLines={1}>
              {masFrecuente ? masFrecuente.nombre : 'Sin enfermedades'}
            </Text>
            <Text style={[s.metricaEtq, { color: C.tenue }]}>
              {masFrecuente ? `${masFrecuente.total} casos detectados` : 'Planta sana o sin datos'}
            </Text>
          </View>
        </View>

        {historial.length > 0 && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Text style={[s.seccionSub, { color: C.tenue }]}>Últimos diagnósticos en este teléfono:</Text>
            {historial.slice(0, 3).map((f) => {
              const sana = f.clase ? esSana(f.clase) : false
              const color = f.estado !== 'diagnostico' ? C.oro : sana ? C.sana : C.rosa
              return (
                <View
                  key={f.id}
                  style={[s.itemHistorial, { backgroundColor: C.fondo2, borderLeftColor: color }]}
                >
                  <Image source={{ uri: f.foto }} style={s.miniFoto} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[s.itemTitulo, { color: C.texto }]} numberOfLines={1}>
                      {f.clase ? infoClase(f.clase, f.etiqueta).nombre : f.estado === 'rechazada' ? 'Foto no válida' : 'No concluyente'}
                    </Text>
                    <Text style={[s.itemDetalle, { color: C.tenue }]}>
                      {CULTIVOS[f.cultivo ?? '']?.nombre ?? '—'} ·{' '}
                      {f.confianza ? Math.round(f.confianza * 100) + ' %' : ''} ·{' '}
                      {new Date(f.fecha).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* 5. Si hay sesión: resumen de parcelas y alertas fitosanitarias */}
      {cuenta && (
        <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
          <View style={s.tarjetaCabecera}>
            <Text style={[s.tarjetaTitulo, { color: C.texto }]}>Mis parcelas y alertas</Text>
            <Pressable onPress={onVerParcelas} hitSlop={8}>
              <Text style={{ color: C.acento, fontSize: 13, fontWeight: '700' }}>Ver parcelas ({parcelas.length}) ›</Text>
            </Pressable>
          </View>

          {alertasParcelas.length > 0 ? (
            <View style={{ gap: 8 }}>
              {alertasParcelas.map(({ parcela, visita }) => (
                <View
                  key={parcela.id}
                  style={[
                    s.alertaCaja,
                    {
                      borderColor: SEVERIDAD[visita.severidad]?.color ?? C.coral,
                      backgroundColor: (SEVERIDAD[visita.severidad]?.color ?? C.coral) + '15',
                    },
                  ]}
                >
                  <Text style={{ fontSize: 18 }}>⚠️</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.alertaTitulo, { color: C.texto }]}>
                      Alerta en {parcela.nombre}
                    </Text>
                    <Text style={[s.alertaTxt, { color: C.tenue }]}>
                      {CULTIVOS[parcela.cultivo]?.nombre ?? ''}: Severidad{' '}
                      {SEVERIDAD[visita.severidad]?.nombre} registrada el{' '}
                      {new Date(visita.fecha).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}.
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[s.tenue, { color: C.tenue }]}>
              {parcelas.length > 0
                ? '✅ Todas tus parcelas registradas se encuentran estables o con síntomas leves.'
                : 'Aún no tienes parcelas creadas. Puedes registrar tu primer lote en la pestaña Parcelas.'}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  contenido: {
    padding: 16,
    gap: 14,
    paddingBottom: 36,
  },
  saludoBloque: {
    gap: 4,
    paddingVertical: 4,
  },
  sobre: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  saludoTxt: {
    fontSize: 24,
    fontWeight: '800',
  },
  subtitulo: {
    fontSize: 13,
    lineHeight: 19,
  },
  botonDiagnosticar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 16,
    minHeight: 74,
  },
  iconoDiagnosticar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  diagnosticarTitulo: {
    fontSize: 18,
    fontWeight: '800',
  },
  diagnosticarSub: {
    fontSize: 13,
  },
  tarjeta: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  tarjetaCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  tarjetaTitulo: {
    fontSize: 17,
    fontWeight: '800',
  },
  tenue: {
    fontSize: 13,
    lineHeight: 19,
  },
  chipsFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  botonAgregarMas: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 12,
  },
  metricasFila: {
    flexDirection: 'row',
    gap: 10,
  },
  metricaCaja: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  metricaNum: {
    fontSize: 24,
    fontWeight: '800',
  },
  metricaSub: {
    fontSize: 14,
    fontWeight: '700',
  },
  metricaEtq: {
    fontSize: 12,
  },
  seccionSub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  itemHistorial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 8,
    borderLeftWidth: 3,
  },
  miniFoto: {
    width: 46,
    height: 46,
    borderRadius: 8,
  },
  itemTitulo: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemDetalle: {
    fontSize: 12,
  },
  alertaCaja: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  alertaTitulo: {
    fontSize: 14,
    fontWeight: '700',
  },
  alertaTxt: {
    fontSize: 12,
    lineHeight: 17,
  },
  avisoMejoras: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginVertical: 4,
  },
  avisoMejorasFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avisoMejorasTitulo: {
    fontSize: 14,
    fontWeight: '700',
  },
  avisoMejorasSub: {
    fontSize: 12,
  },
})
