// Gráficos en SVG/CSS propios: livianos, accesibles y con los colores del tema.

// Columnas verticales (p. ej. análisis por día). datos: [{ etiqueta, valor }]
export function Columnas({ datos, alto = 180 }) {
  const max = Math.max(1, ...datos.map((d) => d.valor))
  return (
    <div className="columnas" style={{ height: alto }} role="img" aria-label="Gráfico de columnas">
      {datos.map((d, i) => (
        <div key={i} className="col" title={`${d.etiqueta}: ${d.valor}`}>
          <span className="col-valor">{d.valor || ''}</span>
          <i style={{ height: `${(d.valor / max) * 100}%`, animationDelay: `${i * 30}ms` }} />
          <small>{d.etiqueta}</small>
        </div>
      ))}
    </div>
  )
}

// Barras horizontales con ranking. datos: [{ etiqueta, valor, color? }]
export function Ranking({ datos, total }) {
  const max = Math.max(1, ...datos.map((d) => d.valor))
  return (
    <ul className="ranking">
      {datos.map((d) => (
        <li key={d.etiqueta}>
          <span className="rk-txt">{d.etiqueta}</span>
          <span className="rk-pista"><i style={{ width: `${(d.valor / max) * 100}%`, background: d.color }} /></span>
          <b>{d.valor}{total ? <small> · {Math.round((d.valor / total) * 100)} %</small> : null}</b>
        </li>
      ))}
    </ul>
  )
}

// Dona con leyenda. datos: [{ etiqueta, valor, color }]
export function Dona({ datos, centro, sub }) {
  const total = datos.reduce((a, d) => a + d.valor, 0) || 1
  let acum = 0
  const r = 42, C = 2 * Math.PI * r
  return (
    <div className="dona">
      <svg viewBox="0 0 100 100" role="img" aria-label={datos.map((d) => `${d.etiqueta} ${d.valor}`).join(', ')}>
        <circle cx="50" cy="50" r={r} className="dona-pista" />
        {datos.map((d) => {
          const largo = (d.valor / total) * C
          const el = <circle key={d.etiqueta} cx="50" cy="50" r={r} stroke={d.color} strokeDasharray={`${largo} ${C - largo}`} strokeDashoffset={-acum} className="dona-arco" />
          acum += largo
          return el
        })}
        <text x="50" y="49" className="dona-centro">{centro}</text>
        <text x="50" y="62" className="dona-sub">{sub}</text>
      </svg>
      <ul className="leyenda-lista">
        {datos.map((d) => <li key={d.etiqueta}><i style={{ background: d.color }} />{d.etiqueta}<b>{d.valor}</b></li>)}
      </ul>
    </div>
  )
}

export function Kpi({ icono: I, titulo, valor, sub, tono = 'acento' }) {
  return (
    <div className={`kpi tono-${tono}`}>
      <div className="kpi-cab"><span>{titulo}</span>{I && <span className="kpi-icono"><I size={18} /></span>}</div>
      <b>{valor}</b>
      {sub && <small>{sub}</small>}
    </div>
  )
}
