import { useEffect, useMemo, useState } from 'react'
import { alertas as apiAlertas, obtenerBrotes } from '../api/cliente'
import AlertasBrote from '../componentes/AlertasBrote'
import { REFRESCO_BROTES } from '../config'
import { CULTIVOS, esSana, infoClase } from '../datos/clases'
import { PROVINCIAS, VIEWBOX } from '../datos/provincias'
import { escala } from '../datos/paleta'
import { fechaHace } from '../datos/utiles'

const PERIODOS = [[7, '7 días'], [30, '30 días'], [90, '90 días']]

// Intensidad: pocos casos = amarillo claro, muchos = rojo oscuro (datos/paleta.js).
function color(v) {
  if (!v) return 'var(--mapa-vacio)'
  return escala(v)
}

export default function Brotes() {
  const [dias, setDias] = useState(30)
  const [cultivo, setCultivo] = useState('')
  const [datos, setDatos] = useState(null)
  const [sel, setSel] = useState(null)
  const [error, setError] = useState('')
  const [alertas, setAlertas] = useState(null)

  useEffect(() => {
    let vivo = true
    const cargar = () => {
      obtenerBrotes(fechaHace(dias)).then((d) => vivo && (setDatos(d), setError('')))
        .catch((e) => vivo && setError(e.message))
      apiAlertas.activas().then((a) => vivo && setAlertas(a)).catch(() => {})
    }
    cargar()
    const t = setInterval(cargar, REFRESCO_BROTES)
    return () => { vivo = false; clearInterval(t) }
  }, [dias])

  // Conteo por provincia de casos enfermos (se excluyen las clases "sana") del cultivo elegido.
  const conteo = useMemo(() => {
    const m = {}
    for (const p of datos?.provincias ?? []) {
      const pc = Object.entries(p.por_clase ?? {}).filter(([c]) => !esSana(c) && (!cultivo || c.startsWith(cultivo + '_')))
      m[p.provincia] = { total: pc.reduce((a, [, n]) => a + n, 0), clases: pc.sort((a, b) => b[1] - a[1]) }
    }
    return m
  }, [datos, cultivo])

  const enAlerta = new Set((alertas?.alertas ?? []).map((a) => a.provincia))
  const max = Math.max(1, ...Object.values(conteo).map((c) => c.total))
  const ranking = PROVINCIAS.map((p) => ({ ...p, ...(conteo[p.id] ?? { total: 0, clases: [] }) })).sort((a, b) => b.total - a.total)
  const total = ranking.reduce((a, p) => a + p.total, 0)
  const activa = ranking.find((p) => p.id === sel) ?? ranking[0]

  return (
    <section>
      <header className="encabezado">
        <div>
          <p className="sobretitulo">Vigilancia fitosanitaria · Región San Martín</p>
          <h2 className="titular">Mapa de brotes</h2>
          <p className="tenue">Casos con enfermedad detectados por FitoLens en cada provincia. Se actualiza solo cada {REFRESCO_BROTES / 1000} s.</p>
        </div>
        <div className="filtros">
          <div className="segmentado" role="group" aria-label="Periodo">
            {PERIODOS.map(([d, t]) => <button key={d} aria-pressed={dias === d} onClick={() => setDias(d)}>{t}</button>)}
          </div>
          <select value={cultivo} onChange={(e) => setCultivo(e.target.value)} aria-label="Cultivo">
            <option value="">Todos los cultivos</option>
            {Object.entries(CULTIVOS).map(([id, c]) => <option key={id} value={id}>{c.nombre}</option>)}
          </select>
        </div>
      </header>
      {error && <p className="alerta mal">{error}</p>}
      <AlertasBrote datos={alertas} alElegir={setSel} />

      <div className="brotes-grid">
        <div className="tarjeta mapa">
          <svg viewBox={VIEWBOX} role="img" aria-label="Mapa de San Martín por provincias">
            {PROVINCIAS.map((p) => {
              const n = conteo[p.id]?.total ?? 0
              return (
                <path key={p.id} d={p.d} fill={color(n / max)} className={`${activa?.id === p.id ? 'activa' : ''} ${enAlerta.has(p.id) ? 'en-alerta' : ''}`}
                  tabIndex="0" onMouseEnter={() => setSel(p.id)} onFocus={() => setSel(p.id)} onClick={() => setSel(p.id)}>
                  <title>{`${p.nombre}: ${n} casos${enAlerta.has(p.id) ? ' · alerta de brote' : ''}`}</title>
                </path>
              )
            })}
            {PROVINCIAS.map((p) => (
              <text key={p.id} x={p.cx} y={p.cy} className="mapa-nombre">{p.nombre}</text>
            ))}
          </svg>
          <div className="leyenda"><span>Pocos casos</span><i /><span>Muchos casos</span></div>
          <p className="tenue pequeno">El color indica cuántos casos con enfermedad hubo: amarillo claro = pocos, rojo oscuro = muchos. Gris = sin casos.{enAlerta.size > 0 && ' Borde rojo que parpadea = alerta de brote.'}</p>
        </div>

        <div className="columna">
          <div className="tarjeta kpi">
            <span>Casos con enfermedad</span><b>{total.toLocaleString('es-PE')}</b>
            <small className="tenue">últimos {dias} días{cultivo && ` · ${CULTIVOS[cultivo].nombre}`}</small>
          </div>
          {activa && (
            <div className="tarjeta">
              <h2>{activa.nombre}</h2>
              <p className="tenue">{activa.total} casos</p>
              {activa.clases.slice(0, 5).map(([c, n]) => (
                <div key={c} className="fila"><span><i className="punto" style={{ background: CULTIVOS[c.split('_')[0]]?.color }} />{CULTIVOS[c.split('_')[0]]?.nombre} · {infoClase(c).nombre}</span><b>{n}</b></div>
              ))}
              {!activa.clases.length && <p className="tenue">Sin casos registrados.</p>}
            </div>
          )}
          <div className="tarjeta">
            <h2>Provincias</h2>
            {ranking.map((p) => (
              <button key={p.id} className={`fila boton-fila ${activa?.id === p.id ? 'sel' : ''}`} onClick={() => setSel(p.id)}>
                <span><i className="punto" style={{ background: color(p.total / max) }} />{p.nombre}</span><b>{p.total}</b>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
