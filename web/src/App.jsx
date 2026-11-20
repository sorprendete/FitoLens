import { useEffect, useState } from 'react'
import Shell from './componentes/Shell'
import { useSesion } from './contexto/Sesion'
import Acceso from './paginas/Acceso'
import { RUTAS, puedeVer } from './rutas'

// Navegación por #hash (no necesita configuración del servidor). Las rutas protegidas
// se comprueban aquí y, de nuevo, en la API: la web nunca es la única barrera.
const leerHash = () => location.hash.slice(1) || ''

export default function App() {
  const s = useSesion()
  const [hash, setHash] = useState(leerHash)
  useEffect(() => {
    const f = () => { setHash(leerHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  if (!s.sesion || hash === 'acceso' || hash === 'registro') {
    if (s.sesion && (hash === 'acceso' || hash === 'registro')) { location.hash = inicio(s); return null }
    return <Acceso modo={hash === 'registro' ? 'registro' : 'acceso'} />
  }

  const ruta = RUTAS.find((r) => r.id === hash)
  if (!ruta || !puedeVer(ruta, s)) {
    // Sin permiso o ruta desconocida: a la página de inicio de su rol (sin mostrar nada privado).
    if (ruta && ruta.acceso !== 'publico' && s.invitado) { location.hash = 'acceso'; return null }
    location.hash = inicio(s); return null
  }
  const { C } = ruta
  return <Shell ruta={ruta}><C /></Shell>
}

const inicio = (s) => (s.usuario ? 'panel' : 'diagnostico')
