import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import DATOS from '../../datos/riesgos.json'

// Matriz de riesgos (Probabilidad × Impacto) del sistema FitoLens en el VPS.
const { escala, riesgos } = DATOS
const nivel = (v) => (v >= escala.niveles.alto ? 'alto' : v >= escala.niveles.medio ? 'medio' : 'bajo')
const TEXTO = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }
const TONO = { alto: 'mal', medio: 'aviso', bajo: 'ok' }
const pos = (r, res) => (res ? r.residual : r)
const conteo = (res) => riesgos.reduce((a, r) => { a[nivel(pos(r, res).probabilidad * pos(r, res).impacto)]++; return a }, { alto: 0, medio: 0, bajo: 0 })

export default function Riesgos() {
  const [residual, setResidual] = useState(false)
  const [activo, setActivo] = useState('R1')
  const antes = conteo(false), despues = conteo(true)
  const sel = riesgos.find((r) => r.id === activo)

  return (
    <div className="apilado">
      <p className="tenue">Riesgo = Probabilidad × Impacto. {riesgos.length} riesgos identificados en FitoLens, antes y después de sus controles.</p>
      <div className="rejilla-3">
        {['alto', 'medio', 'bajo'].map((n) => (
          <div key={n} className={`kpi tono-${TONO[n]}`}>
            <div className="kpi-cab"><span>Riesgo {TEXTO[n].toLowerCase()}</span></div>
            <b className="flecha">{antes[n]}<ArrowRight size={22} />{despues[n]}</b>
            <small>sin controles → con controles</small>
          </div>
        ))}
      </div>

      <div className="rejilla-2 ancha-izq">
        <section className="tarjeta">
          <div className="segmentado">
            <button aria-pressed={!residual} onClick={() => setResidual(false)}>Riesgo inherente</button>
            <button aria-pressed={residual} onClick={() => setResidual(true)}><ShieldCheck size={15} />Con controles</button>
          </div>
          <div className="matriz-r">
            <span className="mr-eje-y">Impacto →</span>
            <div className="mr-rejilla">
              {[5, 4, 3, 2, 1].map((i) => [
                <span key={`e${i}`} className="mr-et" title={escala.impacto[i - 1]}>{i}</span>,
                ...[1, 2, 3, 4, 5].map((p) => (
                  <div key={`${i}-${p}`} className={`mr-celda ${nivel(p * i)}`}>
                    {riesgos.filter((r) => pos(r, residual).probabilidad === p && pos(r, residual).impacto === i).map((r) => (
                      <button key={r.id} className={`mr-punto ${activo === r.id ? 'sel' : ''}`} onClick={() => setActivo(r.id)} title={r.amenaza}>{r.id}</button>
                    ))}
                  </div>
                )),
              ])}
              <span />
              {[1, 2, 3, 4, 5].map((p) => <span key={p} className="mr-et" title={escala.probabilidad[p - 1]}>{p}</span>)}
            </div>
            <span className="mr-eje-x">Probabilidad →</span>
          </div>
        </section>
        <section className="tarjeta">
          {sel ? (
            <>
              <p className="sobre">{sel.id} · {sel.pilar}</p>
              <h3>{sel.amenaza}</h3>
              <p className="tenue">{sel.activo} · {sel.vulnerabilidad}</p>
              <p><span className={`insignia ${TONO[nivel(sel.probabilidad * sel.impacto)]}`}>Inherente {sel.probabilidad * sel.impacto}</span>{' '}
                <ArrowRight size={14} />{' '}<span className={`insignia ${TONO[nivel(sel.residual.probabilidad * sel.residual.impacto)]}`}>Residual {sel.residual.probabilidad * sel.residual.impacto}</span></p>
              <h4>Controles en FitoLens</h4>
              <ul className="controles">{sel.controles.map((c) => <li key={c}><ShieldCheck size={15} />{c}</li>)}</ul>
              {sel.pendiente && <p className="alerta aviso">Pendiente: {sel.pendiente}</p>}
            </>
          ) : <div className="vacio"><ShieldCheck size={40} /><p className="tenue">Toca un riesgo de la matriz para ver sus controles.</p></div>}
        </section>
      </div>

      <section className="tarjeta sin-relleno">
        <table className="tabla">
          <thead><tr><th>ID</th><th>Riesgo</th><th>Pilar</th><th>Inherente</th><th>Residual</th></tr></thead>
          <tbody>
            {[...riesgos].sort((a, b) => b.probabilidad * b.impacto - a.probabilidad * a.impacto).map((r) => {
              const ri = r.probabilidad * r.impacto, rr = r.residual.probabilidad * r.residual.impacto
              return (
                <tr key={r.id} onClick={() => setActivo(r.id)} className={`clicable ${activo === r.id ? 'sel' : ''}`}>
                  <td data-l="ID"><b>{r.id}</b></td>
                  <td data-l="Riesgo" className="principal">{r.amenaza}<small className="tenue bloque-txt">{r.activo}</small></td>
                  <td data-l="Pilar">{r.pilar}</td>
                  <td data-l="Inherente"><span className={`insignia ${TONO[nivel(ri)]}`}>{ri} · {TEXTO[nivel(ri)]}</span></td>
                  <td data-l="Residual"><span className={`insignia ${TONO[nivel(rr)]}`}>{rr} · {TEXTO[nivel(rr)]}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
