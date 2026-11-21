import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ColorSchemeName, useColorScheme } from 'react-native'
import * as SecureStore from 'expo-secure-store'

export type ModoTema = 'sistema' | 'claro' | 'oscuro'
export type TipoTema = 'claro' | 'oscuro'

// Paleta oscura original (azul noche con acentos de color)
export const TEMA_OSCURO = {
  fondo: '#080c1a',
  fondo2: '#0f1528',
  sup: '#121a30',
  sup2: '#18213b',
  borde: '#222c48',
  borde2: '#313d60',
  texto: '#eef2fb',
  tenue: '#95a0bd',
  // Mismos acentos
  acento: '#22d3ee',
  acento2: '#a78bfa',
  rosa: '#f472b6',
  oro: '#fbbf24',
  coral: '#fb7185',
  sana: '#34d399',
  textoBotonAcento: '#080c1a',
}

// Variante clara con los MISMOS tonos de acento (cambian fondo, superficie y texto)
export const TEMA_CLARO = {
  fondo: '#f4f6fb',
  fondo2: '#eaeff7',
  sup: '#ffffff',
  sup2: '#f0f4fa',
  borde: '#d5dfec',
  borde2: '#b8c7db',
  texto: '#0c1322',
  tenue: '#5a6982',
  // Mismos acentos
  acento: '#22d3ee',
  acento2: '#a78bfa',
  rosa: '#f472b6',
  oro: '#fbbf24',
  coral: '#fb7185',
  sana: '#34d399',
  textoBotonAcento: '#080c1a',
}

export type Colores = typeof TEMA_OSCURO

export const PALETAS: Record<TipoTema, Colores> = {
  oscuro: TEMA_OSCURO,
  claro: TEMA_CLARO,
}

// Compatibilidad directa: C apunta al tema oscuro por defecto
export const C = TEMA_OSCURO

export const brillo = (color: string, esClaro = false) => ({
  borderColor: color + (esClaro ? '88' : '66'),
  shadowColor: color,
  shadowOpacity: esClaro ? 0.22 : 0.45,
  shadowRadius: esClaro ? 8 : 14,
  shadowOffset: { width: 0, height: 0 },
  elevation: esClaro ? 3 : 6,
})

interface TemaContextVal {
  modo: ModoTema
  tema: TipoTema
  colores: Colores
  esOscuro: boolean
  setModo: (modo: ModoTema) => void
  brillo: (color: string) => ReturnType<typeof brillo>
}

const K_TEMA = 'fitolens_modo_tema'

const TemaContext = createContext<TemaContextVal>({
  modo: 'sistema',
  tema: 'oscuro',
  colores: TEMA_OSCURO,
  esOscuro: true,
  setModo: () => {},
  brillo: (c) => brillo(c, false),
})

export function TemaProvider({ children }: { children: React.ReactNode }) {
  const sistemaScheme = useColorScheme()
  const [modo, setModoEstado] = useState<ModoTema>('sistema')

  useEffect(() => {
    SecureStore.getItemAsync(K_TEMA)
      .then((val) => {
        if (val === 'claro' || val === 'oscuro' || val === 'sistema') {
          setModoEstado(val)
        }
      })
      .catch(() => {})
  }, [])

  const setModo = useCallback((nuevo: ModoTema) => {
    setModoEstado(nuevo)
    SecureStore.setItemAsync(K_TEMA, nuevo).catch(() => {})
  }, [])

  const tema: TipoTema = useMemo(() => {
    if (modo === 'claro') return 'claro'
    if (modo === 'oscuro') return 'oscuro'
    return sistemaScheme === 'light' ? 'claro' : 'oscuro'
  }, [modo, sistemaScheme])

  const colores = PALETAS[tema]
  const esOscuro = tema === 'oscuro'

  const fnBrillo = useCallback((color: string) => brillo(color, !esOscuro), [esOscuro])

  const value = useMemo(
    () => ({
      modo,
      tema,
      colores,
      esOscuro,
      setModo,
      brillo: fnBrillo,
    }),
    [modo, tema, colores, esOscuro, setModo, fnBrillo]
  )

  return <TemaContext.Provider value={value}>{children}</TemaContext.Provider>
}

export function useTema() {
  return useContext(TemaContext)
}

/**
 * Hook para crear estilos que se recalculan automáticamente con el tema activo.
 */
export function useEstilos<T>(crear: (c: Colores, esOscuro: boolean, tema: TipoTema) => T): {
  s: T
  C: Colores
  tema: TipoTema
  esOscuro: boolean
  brillo: (c: string) => ReturnType<typeof brillo>
} {
  const { colores, tema, esOscuro, brillo: fnBrillo } = useTema()
  const s = useMemo(() => crear(colores, esOscuro, tema), [colores, esOscuro, tema, crear])
  return { s, C: colores, tema, esOscuro, brillo: fnBrillo }
}
