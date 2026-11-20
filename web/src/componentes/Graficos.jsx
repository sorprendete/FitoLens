import { useEffect, useRef, useState } from 'react'
import { PALETA, escala } from '../datos/paleta'

// Gráficos en SVG/CSS propios: livianos, accesibles, multicolor y con los colores del tema.

// Número que sube desde 0 hasta su valor (también "87 %" o "1,840"). Respeta reduced-motion.
export function Contador({ valor, ms = 900 }) {
  const m = String(valor ?? '').match(/^([\d.,]+)(.*)$/)
  const objetivo = m ? parseFloat(m[1].replace(/,/g, '')) : null
  const [v, setV] = useState(objetivo ?? 0)
  const prev = useRef(0)
  useEffect(() => {
    if (objetivo == null || matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(objetivo); return undefined }
    const desde = prev.current, t0 = performance.now()
    let id
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3
      setV(desde + (objetivo - desde) * e)
      if (k < 1) id = requestAnimationFrame(paso); else prev.current = objetivo
    }
    id = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(id)
  }, [objetivo, ms])
  if (objetivo == null) return valor
  const dec = m[1].includes('.') && !m[1].includes(',') ? (m[1].split('.')[1]?.length ?? 0) : 0
  return `${(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${m[2]}`
}

// Columnas verticales (p. ej. análisis por día), con degradado que recorre la paleta.
export function Columnas({ datos, alto = 190 }) {
  const max = Math.max(1, ...datos.map((d) => d.valor))
  return (
    <div className="columnas" style={{ height: alto }} role="img" aria-label="Gráfico de columnas">
      {datos.map((d, i) => {
        const t = datos.length > 1 ? i / (datos.length - 1) : 0
        return (
          <div key={i} className="col" style={{ '--c1': escala(t, ['#a78bfa', '#f472b6', '#fbbf24']), '--c2': escala(t, ['#22d3ee', '#8b5cf6', '#ec4899']) }}>
            <span className="tip"><b>{d.valor}</b> · {d.etiqueta}</span>
            <span className="col-valor">{d.valor || ''}</span>
            <i style={{ height: `${(d.valor / max) * 100}%`, animationDelay: `${i * 35}ms` }} />
            <small>{d.etiqueta}</small>
          </div>
        )
      })}
    </div>
  )
}

// Barras horizontales con ranking. datos: [{ etiqueta, valor, color? }]
export function Ranking({ datos, total }) {
  const max = Math.max(1, ...datos.map((d) => d.valor))
  return (
    <ul className="ranking">
      {datos.map((d, i) => (
        <li key={d.etiqueta} style={{ '--c': d.color || PALETA[i % PALETA.length] }}>
          <span className="rk-txt">{d.etiqueta}</span>
          <span className="rk-pista"><i style={{ width: `${(d.valor / max) * 100}%`, animationDelay: `${i * 80}ms` }} /></span>
          <b>{d.valor}{total ? <small> · {Math.round((d.valor / total) * 100)} %</small> : null}</b>
        </li>
      ))}
    </ul>
  )
}

// Dona con leyenda. datos: [{ etiqueta, valor, color? }]
export function Dona({ datos, centro, sub }) {
  const total = datos.reduce((a, d) => a + d.valor, 0) || 1
  const r = 42, C = 2 * Math.PI * r, hueco = datos.length > 1 ? 2.5 : 0
  let acum = 0
  return (
    <div className="dona">
      <svg viewBox="0 0 100 100" role="img" aria-label={datos.map((d) => `${d.etiqueta} ${d.valor}`).join(', ')}>
        <circle cx="50" cy="50" r={r} className="dona-pista" />
        {datos.map((d, i) => {
          const largo = Math.max(0, (d.valor / total) * C - hueco)
          const el = (
            <circle key={d.etiqueta} cx="50" cy="50" r={r} stroke={d.color || PALETA[i % PALETA.length]} strokeDasharray={`${largo} ${C - largo}`}
              strokeDashoffset={-acum} className="dona-arco" style={{ animationDelay: `${i * 120}ms` }}>
              <title>{`${d.etiqueta}: ${d.valor} (${Math.round((d.valor / total) * 100)} %)`}</title>
            </circle>
          )
          acum += (d.valor / total) * C
          return el
        })}
        <text x="50" y="49" className="dona-centro">{centro}</text>
        <text x="50" y="62" className="dona-sub">{sub}</text>
      </svg>
      <ul className="leyenda-lista">
        {datos.map((d, i) => {
          const c = d.color || PALETA[i % PALETA.length]
          return <li key={d.etiqueta}><i style={{ background: c, color: c }} />{d.etiqueta}<b>{d.valor}<small className="tenue"> · {Math.round((d.valor / total) * 100)} %</small></b></li>
        })}
      </ul>
    </div>
  )
}

export function Kpi({ icono: I, titulo, valor, sub, tono = 'acento' }) {
  return (
    <div className={`kpi tono-${tono}`}>
      <div className="kpi-cab"><span>{titulo}</span>{I && <span className="kpi-icono"><I size={18} /></span>}</div>
      <b><Contador valor={valor} /></b>
      {sub && <small>{sub}</small>}
    </div>
  )
}
