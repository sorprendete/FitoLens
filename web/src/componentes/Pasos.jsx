import { Crop, Flame, Gauge, Leaf, ScanSearch, Sprout } from 'lucide-react'

const ICONO = { router: Sprout, especialista: ScanSearch, calibracion: Gauge, segmentacion: Leaf, mapa_calor: Flame }

// Línea de tiempo de lo que hizo la IA con esta foto (campo "pasos" de la API).
export default function Pasos({ pasos = [] }) {
  if (!pasos.length) return null
  const total = pasos.reduce((a, p) => a + (p.ms || 0), 0)
  return (
    <ol className="pasos">
      {pasos.map((p, i) => {
        const Icono = ICONO[p.id] || Crop
        return (
          <li key={p.id || i} style={{ animationDelay: `${i * 120}ms` }}>
            <span className="paso-icono"><Icono size={18} /></span>
            <div><b>{p.titulo || p}</b>{p.detalle && <small>{p.detalle}</small>}</div>
            {p.ms != null && <em>{Math.round(p.ms)} ms</em>}
          </li>
        )
      })}
      {total > 0 && <li className="pasos-total">Total: {Math.round(total)} ms en el servidor, sin GPU</li>}
    </ol>
  )
}
