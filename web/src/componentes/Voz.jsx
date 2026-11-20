import { Square, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { IDIOMAS, textoVoz } from '../datos/voz'

const CLAVE = 'fitolens.voz'
const leer = () => { try { return localStorage.getItem(CLAVE) || 'es' } catch { return 'es' } }

// Botón "Escuchar": lee el resultado con la voz del navegador (sin internet ni servicios externos).
export default function Voz({ r, info, sana }) {
  const [idioma, setIdioma] = useState(leer)
  const [hablando, setHablando] = useState(false)
  const voz = typeof window !== 'undefined' && window.speechSynthesis
  useEffect(() => () => voz?.cancel(), [voz, r])
  if (!voz) return null

  function hablar() {
    if (hablando) { voz.cancel(); setHablando(false); return }
    const u = new SpeechSynthesisUtterance(textoVoz(r, info, sana, idioma))
    const voces = voz.getVoices()
    u.voice = voces.find((v) => v.lang === 'es-PE') || voces.find((v) => v.lang?.startsWith('es')) || null
    u.lang = u.voice?.lang || 'es-PE'
    u.rate = idioma === 'qu' ? 0.85 : 0.95
    u.onend = u.onerror = () => setHablando(false)
    voz.cancel(); voz.speak(u); setHablando(true)
  }
  function cambiar(e) {
    setIdioma(e.target.value); voz.cancel(); setHablando(false)
    try { localStorage.setItem(CLAVE, e.target.value) } catch { /* sin almacenamiento */ }
  }

  return (
    <div className="acciones voz">
      <button className="btn sec" onClick={hablar} aria-pressed={hablando}>
        {hablando ? <Square /> : <Volume2 />}{hablando ? 'Detener' : 'Escuchar resultado'}
      </button>
      <select value={idioma} onChange={cambiar} aria-label="Idioma de la voz">
        {Object.entries(IDIOMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  )
}
