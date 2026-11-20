import { useEffect, useState } from 'react'
import ErrorPantalla from './componentes/ErrorPantalla'
import Shell from './componentes/Shell'
import { useSesion } from './contexto/Sesion'
import Acceso from './paginas/Acceso'
import { RUTAS, puedeVer } from './rutas'

// Navegación por #hash (no necesita configuración del servidor). Las rutas protegidas
// se comprueban aquí y, de nuevo, en la API: la web nunca es la única barrera.
// Regla: decidir qué mostrar es una función pura; corregir la URL se hace después, sin recargar.
const leerHash = () => decodeURIComponent(location.hash.slice(1))

function resolver(hash, s) {
  const inicio = s.usuario ? 'panel' : 'diagnostico'
  if (hash === 'acceso' || hash === 'registro') return s.usuario ? { id: inicio } : { acceso: hash }
  if (!s.sesion) return { acceso: 'acceso' }
  const ruta = RUTAS.find((r) => r.id === hash)
  if (ruta && puedeVer(ruta, s)) return { id: ruta.id }
  if (ruta && s.invitado) return { acceso: 'acceso' } // sección con cuenta: pedir login
  return { id: inicio }
}

export default function App() {
  const s = useSesion()
  const [hash, setHash] = useState(leerHash)
  useEffect(() => {
    const f = () => { setHash(leerHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  const destino = resolver(hash, s)
  const real = destino.acceso ?? destino.id
  useEffect(() => {
    if (real !== hash) { history.replaceState(null, '', `#${real}`); setHash(real) }
  }, [real, hash])

  if (destino.acceso) return <ErrorPantalla><Acceso modo={destino.acceso} /></ErrorPantalla>
  const ruta = RUTAS.find((r) => r.id === destino.id)
  const { C } = ruta
  return <Shell ruta={ruta}><ErrorPantalla key={ruta.id}><C /></ErrorPantalla></Shell>
}
