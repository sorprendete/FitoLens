import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fijarToken, iniciarSesion, iniciarSesionGoogle, registrarse, yo } from '../api/cliente'

// Sesión del usuario: token JWT propio de la API, guardado en este navegador.
// "invitado" = entró sin cuenta: puede diagnosticar y ver brotes, pero no tiene historial.
const Ctx = createContext(null)
const CLAVE = 'fitolens.sesion'
const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) } catch { return null } }
const guardar = (v) => { try { v ? localStorage.setItem(CLAVE, JSON.stringify(v)) : localStorage.removeItem(CLAVE) } catch { /* sin almacenamiento */ } }

export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(leer) // { token, usuario } | { invitado: true } | null
  const salir = useCallback(() => { guardar(null); setSesion(null); fijarToken(null); location.hash = '#acceso' }, [])

  fijarToken(sesion?.token ?? null, salir)

  // Al abrir la web se confirma que el token siga vigente y se refrescan nombre y rol.
  useEffect(() => {
    if (!sesion?.token) return
    yo().then((u) => setSesion((s) => (s?.token ? { ...s, usuario: u } : s))).catch(() => {})
  }, [sesion?.token])

  useEffect(() => guardar(sesion), [sesion])

  const valor = useMemo(() => ({
    sesion,
    usuario: sesion?.usuario ?? null,
    esAdmin: sesion?.usuario?.rol === 'admin',
    invitado: !!sesion?.invitado,
    async entrar(email, password) { const r = await iniciarSesion(email, password); setSesion({ token: r.access_token, usuario: r.usuario }) },
    async entrarConGoogle(id_token) { const r = await iniciarSesionGoogle(id_token); setSesion({ token: r.access_token, usuario: r.usuario }) },
    async registrar(nombre, email, password) { const r = await registrarse(nombre, email, password); setSesion({ token: r.access_token, usuario: r.usuario }) },
    comoInvitado() { setSesion({ invitado: true }) },
    salir,
  }), [sesion, salir])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export const useSesion = () => useContext(Ctx)
