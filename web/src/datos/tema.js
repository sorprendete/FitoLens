import { useEffect, useState } from 'react'

// Tema claro/oscuro: se recuerda en este navegador. Por defecto, el del sistema.
const CLAVE = 'fitolens.tema'
const inicial = () => {
  try { const t = localStorage.getItem(CLAVE); if (t) return t } catch { /* sin almacenamiento */ }
  return matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro'
}
export function aplicarTema(t = inicial()) { document.documentElement.dataset.tema = t; return t }

export function usarTema() {
  const [tema, setTema] = useState(inicial)
  useEffect(() => { aplicarTema(tema); try { localStorage.setItem(CLAVE, tema) } catch { /* nada */ } }, [tema])
  return [tema, () => setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro'))]
}
