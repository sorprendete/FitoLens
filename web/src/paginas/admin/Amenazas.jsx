import { Bot, BrainCircuit, Play, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { admin } from '../../api/cliente'
import { Kpi } from '../../componentes/Graficos'

const NIVEL = { alto: ['Riesgo alto', 'mal'], medio: ['Riesgo medio', 'aviso'], normal: ['Normal', 'ok'] }

export default function Amenazas() {
  const [dias, setDias] = useState(7)
  const [simulado, setSimulado] = useState(false)
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)

  const analizar = useCallback(() => {
    setCargando(true); setError('')
    admin.amenazas(dias, simulado).then(setD).catch((e) => setError(e.message)).finally(() => setCargando(false))
  }, [dias, simulado])
  useEffect(analizar, [analizar])

  const umbral = d?.modelo?.umbral_puntaje ?? 55
  const sospechosas = d?.ips?.filter((i) => i.nivel !== 'normal') ?? []

  return (
    <div className="apilado">
      <section className="tarjeta destacada">
        <div className="radar" aria-hidden="true"><i /><i /><i /><span /></div>
        <div>
          <h2>Detección de ataques con aprendizaje automático</h2>
          <p className="tenue">Se combinan <b>reglas</b> (por ejemplo, 5 contraseñas fallidas = fuerza bruta) con <b>Isolation Forest</b>, un modelo no supervisado
            que aprende cómo se comporta una IP normal a partir de la auditoría y marca las que se salen del patrón, aunque ninguna regla las describa.</p>
          <div className="barra-filtros">
            <div className="segmentado">{[1, 7, 30].map((n) => <button key={n} aria-pressed={dias === n} onClick={() => setDias(n)}>{n === 1 ? '24 h' : `${n} días`}</button>)}</div>
            <div className="segmentado">
              <button aria-pressed={!simulado} onClick={() => setSimulado(false)}>Tráfico real</button>
              <button aria-pressed={simulado} onClick={() => setSimulado(true)}>Ataque simulado</button>
            </div>
            <button className="btn" onClick={analizar} disabled={cargando}>{cargando ? <span className="girando" /> : <Play size={17} />}Analizar</button>
          </div>
          {d?.fuente === 'simulado' && <p className="alerta aviso">Tráfico de prueba generado para la demostración. No son accesos reales.</p>}
        </div>
      </section>
      {error && <p className="alerta mal">{error}</p>}

      {d && (
        <>
          <div className="rejilla-kpi">
            <Kpi icono={ShieldCheck} titulo="Eventos analizados" valor={d.resumen.eventos.toLocaleString('es-PE')} sub={`${d.resumen.ips} IPs distintas`} />
            <Kpi icono={ShieldAlert} titulo="Riesgo alto" valor={d.resumen.alto} tono="mal" />
            <Kpi icono={TriangleAlert} titulo="Riesgo medio" valor={d.resumen.medio} tono="aviso" />
            <Kpi icono={BrainCircuit} titulo="Solo lo vio el ML" valor={d.resumen.solo_ml} sub="ninguna regla lo detectó" />
          </div>

          <div className="rejilla-2">
            <section className="tarjeta">
              <header className="tarjeta-cab"><h3>Puntaje de anomalía por IP</h3><span className="tenue">umbral {umbral}</span></header>
              <div className="puntajes">
                <i className="umbral" style={{ left: `${umbral}%` }}><span>umbral</span></i>
                {d.ips.map((ip) => (
                  <span key={ip.ip} className={`pt ${NIVEL[ip.nivel][1]}`} style={{ left: `${Math.min(99, ip.puntaje)}%` }} title={`${ip.ip}: ${ip.puntaje}`} />
                ))}
              </div>
              <div className="eje"><span>0 · normal</span><span>100 · muy aislada</span></div>
              {!d.modelo.entrenado && <p className="alerta aviso">{d.modelo.motivo}</p>}
            </section>
            <section className="tarjeta">
              <header className="tarjeta-cab"><h3>Tipos de amenaza</h3></header>
              {Object.keys(d.resumen.por_tipo).length ? (
                <ul className="lista-simple">{Object.entries(d.resumen.por_tipo).map(([t, n]) => <li key={t}><span>{t}</span><b>{n}</b></li>)}</ul>
              ) : <p className="tenue">Sin amenazas en este periodo.</p>}
              <p className="tenue pequeno">{d.modelo.algoritmo} · {d.modelo.arboles} árboles · {d.modelo.caracteristicas.length} características por IP</p>
            </section>
          </div>

          <section className="apilado">
            <h3>IPs sospechosas ({sospechosas.length})</h3>
            {!sospechosas.length && <div className="tarjeta vacio"><ShieldCheck size={40} /><p>No se detectó actividad sospechosa.</p></div>}
            {sospechosas.map((ip) => (
              <article key={ip.ip} className={`tarjeta ip-tarjeta borde-${NIVEL[ip.nivel][1]}`}>
                <button className="ip-cab" onClick={() => setAbierta(abierta === ip.ip ? null : ip.ip)} aria-expanded={abierta === ip.ip}>
                  <code>{ip.ip}</code>
                  <span className={`insignia ${NIVEL[ip.nivel][1]}`}>{NIVEL[ip.nivel][0]}</span>
                  {ip.solo_ml && <span className="insignia acento"><Bot size={14} />Detectado solo por ML</span>}
                  <span className="ip-puntaje">puntaje <b>{ip.puntaje}</b></span>
                </button>
                <div className="ip-cuerpo">
                  {ip.reglas.map((r) => <p key={r.tipo} className="regla"><TriangleAlert size={15} /><b>{r.tipo}:</b> {r.detalle}</p>)}
                  {ip.explicacion.map((x) => <p key={x} className="regla ml"><BrainCircuit size={15} />{x}</p>)}
                  {abierta === ip.ip && (
                    <dl className="caracteristicas">
                      {Object.entries(ip.caracteristicas).map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd>{String(v)}</dd></div>)}
                    </dl>
                  )}
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
