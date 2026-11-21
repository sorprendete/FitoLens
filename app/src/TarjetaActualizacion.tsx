// Componente reutilizable de actualización requerida para FitoLens.
// Muestra el estado del servicio nativo (descargando, pausada, sin conexión, error, lista para instalar)
// y gestiona permisos de instalación en Android con reintento automático al volver a la app.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTema } from './tema'
import { Novedad, VERSION_APP, esMayor, instalarActualizacion } from './actualizacion'
import {
  abrirAjustesInstalacion,
  cancelar,
  disponible,
  escuchar,
  estado as consultarEstado,
  instalar,
  pausar,
  puedeInstalar,
  reanudar,
  type EstadoDescarga,
} from '../modules/descarga-apk'

// Control de tarjetas activas para evitar franjas duplicadas con AvisoActualizacion
let contadorTarjetas = 0
const oyentesTarjeta = new Set<(visible: boolean) => void>()

export function registrarTarjetaVisible(visible: boolean) {
  try {
    if (visible) {
      contadorTarjetas++
    } else {
      contadorTarjetas = Math.max(0, contadorTarjetas - 1)
    }
    const hay = contadorTarjetas > 0
    oyentesTarjeta.forEach((fn) => {
      try { fn(hay) } catch {}
    })
  } catch {}
}

export function escucharTarjetaVisible(fn: (visible: boolean) => void) {
  try {
    oyentesTarjeta.add(fn)
    return () => {
      try { oyentesTarjeta.delete(fn) } catch {}
    }
  } catch {
    return () => {}
  }
}

export function hayTarjetaVisible(): boolean {
  return contadorTarjetas > 0
}

export interface TarjetaActualizacionProps {
  novedad: Novedad
  onCerrar?: () => void
  titulo?: string
  descripcion?: string
}

export default function TarjetaActualizacion({
  novedad,
  onCerrar,
  titulo,
  descripcion,
}: TarjetaActualizacionProps) {
  const { colores: C, brillo } = useTema()
  const [ed, setEd] = useState<EstadoDescarga | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const [faltaPermiso, setFaltaPermiso] = useState(false)
  const reintentarRef = useRef(false)

  // Ocultar AvisoActualizacion mientras esta tarjeta esté visible
  useEffect(() => {
    try { registrarTarjetaVisible(true) } catch {}
    return () => {
      try { registrarTarjetaVisible(false) } catch {}
    }
  }, [])

  // Comprueba si el estado del módulo nativo corresponde a esta novedad o versión mayor
  const esVigente = useCallback(
    (e: EstadoDescarga | null | undefined): boolean => {
      if (!e || typeof e !== 'object') return false
      if (e.estado === 'inactiva') return false
      if (e.version) {
        if (novedad?.version && e.version === novedad.version) return true
        if (!esMayor(e.version, VERSION_APP)) return false
      }
      return true
    },
    [novedad?.version]
  )

  // Escuchar estado nativo del servicio
  useEffect(() => {
    if (!disponible) return
    let montado = true

    try {
      const inicial = consultarEstado()
      if (montado && esVigente(inicial)) {
        setEd(inicial)
      }
    } catch {}

    const desuscribir = escuchar((e) => {
      if (!montado) return
      try {
        if (esVigente(e)) {
          setEd(e)
          if (e.estado !== 'lista') {
            setFaltaPermiso(false)
            reintentarRef.current = false
          }
        } else {
          setEd(null)
        }
      } catch {}
    })

    return () => {
      montado = false
      try { desuscribir?.() } catch {}
    }
  }, [esVigente])

  // Ejecutar instalación y verificar permisos
  const ejecutarInstalar = useCallback(() => {
    try {
      const res = instalar()
      if (res === 'permiso_requerido') {
        setFaltaPermiso(true)
        reintentarRef.current = true
        try { abrirAjustesInstalacion() } catch {}
      } else if (res === 'archivo_no_encontrado' || res === 'no_lista') {
        setEd(null)
        setFaltaPermiso(false)
        reintentarRef.current = false
      } else if (res === 'ok') {
        setFaltaPermiso(false)
        reintentarRef.current = false
      }
    } catch {
      setEd(null)
      setFaltaPermiso(false)
      reintentarRef.current = false
    }
  }, [])

  // Al volver a la app, si faltaba permiso y ya fue concedido, reintentar automáticamente
  useEffect(() => {
    let montado = true
    const sub = AppState.addEventListener('change', (estadoApp) => {
      try {
        if (estadoApp === 'active' && montado) {
          if (faltaPermiso || reintentarRef.current) {
            if (puedeInstalar()) {
              setFaltaPermiso(false)
              reintentarRef.current = false
              ejecutarInstalar()
            }
          }
        }
      } catch {}
    })
    return () => {
      montado = false
      try { sub.remove() } catch {}
    }
  }, [faltaPermiso, ejecutarInstalar])

  const iniciar = async () => {
    try {
      setIniciando(true)
      setFaltaPermiso(false)
      reintentarRef.current = false

      // Si ya está lista en el almacenamiento, abrir instalador directo
      const actual = consultarEstado()
      if (actual && actual.estado === 'lista' && esVigente(actual)) {
        setEd(actual)
        ejecutarInstalar()
        return
      }

      await instalarActualizacion(novedad)
      const despues = consultarEstado()
      if (despues && esVigente(despues)) {
        setEd(despues)
      }
    } catch {
    } finally {
      setIniciando(false)
    }
  }

  const accionPausar = () => {
    try { pausar() } catch {}
  }

  const accionReanudar = () => {
    try { reanudar() } catch {}
  }

  const accionCancelar = () => {
    try {
      cancelar()
      setEd(null)
      setFaltaPermiso(false)
      reintentarRef.current = false
    } catch {}
  }

  const accionAbrirAjustes = () => {
    try { abrirAjustesInstalacion() } catch {}
  }

  const totalBytes = ed?.total && ed.total > 0 ? ed.total : (novedad.tamano_mb ? novedad.tamano_mb * 1024 * 1024 : 0)
  const bytesDescargados = ed?.bytes && ed.bytes > 0 ? ed.bytes : 0
  const pct = totalBytes > 0 ? Math.min(100, Math.max(0, Math.round((bytesDescargados / totalBytes) * 100))) : 0
  const descMB = (bytesDescargados / (1024 * 1024)).toFixed(1)
  const totalMB = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : (novedad.tamano_mb ? String(novedad.tamano_mb) : '?')
  const tituloMostrar = titulo || `Para agregar cultivos primero actualiza la app a la ${novedad.version}`
  const descMostrar = descripcion || 'Se requiere actualizar la app para asegurar la compatibilidad con los nuevos modelos especialistas.'

  const estadoActual = ed?.estado ?? 'inactiva'

  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.acento }, brillo(C.acento)]}>
      <Text style={[s.sobre, { color: C.acento }]}>ACTUALIZACIÓN REQUERIDA</Text>
      <Text style={[s.titulo, { color: C.texto }]}>{tituloMostrar}</Text>

      {/* Estado: Inicial */}
      {estadoActual === 'inactiva' && (
        <>
          <Text style={[s.tenue, { color: C.tenue }]}>
            {descMostrar}
            {novedad.tamano_mb ? ` (${novedad.tamano_mb} MB)` : ''}
          </Text>
          <View style={s.filaBotones}>
            <Pressable
              onPress={iniciar}
              disabled={iniciando}
              style={({ pressed }) => [
                s.botonPrincipal,
                { backgroundColor: C.acento },
                brillo(C.acento),
                (pressed || iniciando) && { opacity: 0.8 },
              ]}
            >
              {iniciando ? (
                <ActivityIndicator color={C.textoBotonAcento} size="small" />
              ) : (
                <Text style={[s.botonPrincipalTxt, { color: C.textoBotonAcento }]}>Actualizar</Text>
              )}
            </Pressable>
            {onCerrar && (
              <Pressable onPress={onCerrar} style={s.accionBtn} hitSlop={8}>
                <Text style={[s.btnSecundarioTxt, { color: C.tenue }]}>Cerrar</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      {/* Estado: Descargando */}
      {estadoActual === 'descargando' && (
        <View style={s.bloqueProgreso}>
          <View style={s.filaEstado}>
            <Text style={[s.estadoTxt, { color: C.acento }]}>
              Descargando… {pct} % · {descMB} de {totalMB} MB
            </Text>
            <View style={s.filaAccionesMini}>
              <Pressable onPress={accionPausar} hitSlop={8} style={s.accionMiniBtn}>
                <Text style={{ color: C.oro, fontWeight: '700', fontSize: 13 }}>Pausar</Text>
              </Pressable>
              <Pressable onPress={accionCancelar} hitSlop={8} style={s.accionMiniBtn}>
                <Text style={{ color: C.coral, fontWeight: '700', fontSize: 13 }}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
          <View style={[s.pista, { backgroundColor: C.fondo2 }]}>
            <View style={[s.barra, { width: `${pct}%`, backgroundColor: C.acento }]} />
          </View>
        </View>
      )}

      {/* Estado: Pausada */}
      {estadoActual === 'pausada' && (
        <View style={s.bloqueProgreso}>
          <View style={s.filaEstado}>
            <Text style={[s.estadoTxt, { color: C.oro }]}>
              En pausa · {pct} % ({descMB} de {totalMB} MB)
            </Text>
            <View style={s.filaAccionesMini}>
              <Pressable onPress={accionReanudar} hitSlop={8} style={s.accionMiniBtn}>
                <Text style={{ color: C.acento, fontWeight: '700', fontSize: 13 }}>Reanudar</Text>
              </Pressable>
              <Pressable onPress={accionCancelar} hitSlop={8} style={s.accionMiniBtn}>
                <Text style={{ color: C.coral, fontWeight: '700', fontSize: 13 }}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
          <View style={[s.pista, { backgroundColor: C.fondo2 }]}>
            <View style={[s.barra, { width: `${pct}%`, backgroundColor: C.oro }]} />
          </View>
        </View>
      )}

      {/* Estado: Sin conexión */}
      {estadoActual === 'sin_conexion' && (
        <View style={s.bloqueProgreso}>
          <View style={s.filaEstado}>
            <Text style={[s.estadoTxt, { color: C.coral }]}>
              Sin conexión · {pct} %
            </Text>
            <View style={s.filaAccionesMini}>
              <Pressable onPress={accionReanudar} hitSlop={8} style={s.accionMiniBtn}>
                <Text style={{ color: C.acento, fontWeight: '700', fontSize: 13 }}>Reintentar</Text>
              </Pressable>
              <Pressable onPress={accionCancelar} hitSlop={8} style={s.accionMiniBtn}>
                <Text style={{ color: C.coral, fontWeight: '700', fontSize: 13 }}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
          <View style={[s.pista, { backgroundColor: C.fondo2 }]}>
            <View style={[s.barra, { width: `${pct}%`, backgroundColor: C.coral }]} />
          </View>
        </View>
      )}

      {/* Estado: Error */}
      {estadoActual === 'error' && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: C.coral, fontSize: 13, lineHeight: 18 }}>
            {ed?.error || 'Ocurrió un error al descargar la actualización.'}
          </Text>
          <View style={s.filaBotones}>
            <Pressable
              onPress={iniciar}
              style={[s.botonPrincipal, { backgroundColor: C.acento }, brillo(C.acento)]}
            >
              <Text style={[s.botonPrincipalTxt, { color: C.textoBotonAcento }]}>Reintentar</Text>
            </Pressable>
            <Pressable onPress={accionCancelar} style={s.accionBtn} hitSlop={8}>
              <Text style={[s.btnSecundarioTxt, { color: C.tenue }]}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Estado: Lista para instalar */}
      {estadoActual === 'lista' && (
        <View style={{ gap: 8 }}>
          <Text style={[s.tenue, { color: faltaPermiso ? C.coral : C.acento, fontWeight: '600' }]}>
            {faltaPermiso
              ? 'Falta permiso: activa "Permitir desde esta fuente" y toca Instalar.'
              : 'Actualización descargada y lista para instalar.'}
          </Text>
          <View style={s.filaBotones}>
            <Pressable
              onPress={ejecutarInstalar}
              style={({ pressed }) => [
                s.botonPrincipal,
                { backgroundColor: C.acento },
                brillo(C.acento),
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[s.botonPrincipalTxt, { color: C.textoBotonAcento }]}>Instalar</Text>
            </Pressable>
            {faltaPermiso && (
              <Pressable onPress={accionAbrirAjustes} style={s.accionBtn} hitSlop={8}>
                <Text style={[s.btnSecundarioTxt, { color: C.acento }]}>Abrir ajustes</Text>
              </Pressable>
            )}
            {onCerrar && !faltaPermiso && (
              <Pressable onPress={onCerrar} style={s.accionBtn} hitSlop={8}>
                <Text style={[s.btnSecundarioTxt, { color: C.tenue }]}>Cerrar</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  tarjeta: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    marginVertical: 4,
  },
  sobre: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  titulo: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  tenue: {
    fontSize: 13,
    lineHeight: 18,
  },
  estadoTxt: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  bloqueProgreso: {
    gap: 8,
    marginTop: 4,
  },
  filaEstado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  filaAccionesMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accionMiniBtn: {
    minHeight: 36,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  pista: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barra: {
    height: '100%',
    borderRadius: 4,
  },
  filaBotones: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  botonPrincipal: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botonPrincipalTxt: {
    fontSize: 14,
    fontWeight: '800',
  },
  accionBtn: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  btnSecundarioTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
})
