import { Activity, BarChart3, Brain, Map, ScanLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { alCambiarDemo, esDemo } from './api/cliente'
import Brotes from './paginas/Brotes'
import ComoPiensa from './paginas/ComoPiensa'
import Diagnostico from './paginas/Diagnostico'
import Modelos from './paginas/Modelos'

// Navegación por #hash: no requiere configuración especial del servidor ni librería de rutas.
const PAGINAS = {
  diagnostico: { titulo: 'Diagnosticar', icono: ScanLine, C: Diagnostico },
  'como-piensa': { titulo: 'Cómo piensa', icono: Brain, C: ComoPiensa },
  brotes: { titulo: 'Brotes', icono: Map, C: Brotes },
  modelos: { titulo: 'Precisión', icono: BarChart3, C: Modelos },
}
const actual = () => (PAGINAS[location.hash.slice(1)] ? location.hash.slice(1) : 'diagnostico')

export default function App() {
  const [pagina, setPagina] = useState(actual)
  const [demo, setDemo] = useState(esDemo)
  useEffect(() => {
    const f = () => { setPagina(actual()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    const quitar = alCambiarDemo(setDemo)
    return () => { window.removeEventListener('hashchange', f); quitar() }
  }, [])
  const { C } = PAGINAS[pagina]

  return (
    <>
      <header className="barra-sup">
        <a href="#diagnostico" className="logo" aria-label="FitoLens, inicio">
          <img src="/favicon.svg" alt="" width="32" height="32" /><span>Fito<b>Lens</b></span>
        </a>
        <nav aria-label="Secciones">
          {Object.entries(PAGINAS).map(([id, { titulo, icono: I }]) => (
            <a key={id} href={`#${id}`} aria-current={pagina === id ? 'page' : undefined}><I size={18} /><span>{titulo}</span></a>
          ))}
        </nav>
        {demo && <span className="demo" title="La API no respondió: se muestran datos de ejemplo, no resultados reales."><Activity size={14} />Modo demostración</span>}
      </header>
      <main><C /></main>
      <footer className="pie">FitoLens · EXPOFERIA FISI 2026 · Universidad Nacional de San Martín, Tarapoto</footer>
    </>
  )
}
