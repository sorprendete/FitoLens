import { Activity, AlertTriangle, Download, Leaf, MapPin, Siren } from 'lucide-react'
import { useEffect, useState } from 'react'
import { descargar, reporteSemanal } from '../../api/cliente'
import { CULTIVOS } from '../../datos/clases'

// Tendencia de casos con enfermedad frente a la semana anterior. Verde no se usa: verde solo significa "sano".
const TENDENCIA = { sube: ['▲ Sube', 'mal'], nuevo: ['● Nuevo', 'aviso'], baja: ['▼ Baja', 'acento'], estable: ['= Estable', 'neutro'] }
const fecha = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
const pct = (x) => `${Math.round(x * 100)}%`

function Kpi({ icono: I, titulo, valor, sub, tono = 'acento' }) {
  return <div className={`kpi tono-${tono}`}><div className="kpi-cab">{titulo}<span className="kpi-icono"><I size={18} /></span></div><b>{valor}</b><small>{sub}</small></div>
}

function Barras({ serie }) {
  const max = Math.max(1, ...serie)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 3, height: 22 }} aria-label={`Casos por semana: ${serie.join(', ')}`}>
      {serie.map((v, i) => <i key={i} title={`${v} casos`} style={{ width: 7, height: `${Math.max(8, (v / max) * 100)}%`, borderRadius: 2, background: 'var(--mal)', opacity: v ? 0.35 + 0.65 * (i + 1) / serie.length : 0.15 }} />)}
    </span>
  )
}

export default function Reporte() {
  const [semanas, setSemanas] = useState(4)
  const [hasta, setHasta] = useState('')
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [bajando, setBajando] = useState(false)
  useEffect(() => {
    setD(null); setError('')
    reporteSemanal(semanas, hasta).then(setD).catch((e) => setError(e.message))
  }, [semanas, hasta])

  const excel = () => {
    setBajando(true)
    descargar(`/reportes/semanal.xlsx?semanas=${semanas}${hasta ? `&hasta=${hasta}` : ''}`, 'fitolens_reporte.xlsx')
      .catch((e) => setError(e.message)).finally(() => setBajando(false))
  }
  const t = d?.totales

  return (
    <div className="apilado">
      <p className="tenue">Resumen semanal por provincia y cultivo para la agencia agraria y el gobierno regional. Las semanas empiezan el lunes; la tendencia compara los casos con enfermedad de la última semana con los de la anterior.</p>
      <div className="barra-filtros">
        <div className="segmentado">
          {[4, 8, 12].map((n) => <button key={n} aria-pressed={semanas === n} onClick={() => setSemanas(n)}>{n} semanas</button>)}
        </div>
        <label className="campo-inline"><span>Hasta</span><input type="date" className="entrada-fecha" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <button className="btn" onClick={excel} disabled={bajando || !d}><Download size={17} />{bajando ? 'Generando…' : 'Descargar Excel'}</button>
      </div>
      {error && <p className="alerta mal">{error}</p>}

      {d && <>
        <p className="tenue">Del {fecha(d.desde)} al {fecha(d.hasta)}</p>
        <div className="rejilla-kpi">
          <Kpi icono={Activity} titulo="Diagnósticos" valor={t.analisis} sub={`${d.semanas.at(-1).analisis} esta semana`} />
          <Kpi icono={Leaf} titulo="Plantas sanas" valor={t.sanos} sub={t.analisis ? `${pct(t.sanos / t.analisis)} del total` : 'Sin datos'} tono="ok" />
          <Kpi icono={AlertTriangle} titulo="Con enfermedad" valor={t.enfermos} sub={`${d.semanas.at(-1).enfermos} esta semana`} tono="mal" />
          <Kpi icono={MapPin} titulo="Provincias con casos" valor={t.provincias_con_casos} sub={`${t.alertas} alertas de brote`} tono="aviso" />
        </div>
      </>}

      <section className="tarjeta sin-relleno">
        <table className="tabla">
          <thead><tr><th>Provincia</th><th>Cultivo</th><th>Diagnósticos</th><th>Con enfermedad</th><th>Enfermedad principal</th><th>Por semana</th><th>Tendencia</th></tr></thead>
          <tbody>
            {!d && !error && Array.from({ length: 6 }, (_, i) => <tr key={i} className="esqueleto"><td colSpan="7"><i /></td></tr>)}
            {d?.filas.map((f) => {
              const [txt, tono] = TENDENCIA[f.tendencia] ?? [f.tendencia, 'neutro']
              return (
                <tr key={f.provincia + f.cultivo}>
                  <td data-l="Provincia" className="principal">{f.provincia_nombre}</td>
                  <td data-l="Cultivo"><span className="chip-cultivo" style={{ '--c': CULTIVOS[f.cultivo]?.color ?? 'var(--tenue)' }}>{f.cultivo_nombre}</span></td>
                  <td data-l="Diagnósticos">{f.analisis}</td>
                  <td data-l="Con enfermedad">{f.enfermos} <small className="tenue">({pct(f.pct_enfermos)})</small></td>
                  <td data-l="Enfermedad principal" title={f.enfermedades.map((e) => `${e.etiqueta}: ${e.casos}`).join('\n')}>{f.principal ? `${f.principal.etiqueta} (${f.principal.casos})` : '—'}</td>
                  <td data-l="Por semana"><Barras serie={f.enfermos_por_semana} /></td>
                  <td data-l="Tendencia"><span className={`insignia ${tono}`}>{txt}{f.tendencia_pct != null && f.tendencia_pct !== 0 ? ` ${f.tendencia_pct > 0 ? '+' : ''}${f.tendencia_pct}%` : ''}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {d && !d.filas.length && <p className="tenue centro relleno">Sin diagnósticos en este periodo.</p>}
      </section>

      {d?.alertas.length > 0 && (
        <section className="tarjeta">
          <div className="tarjeta-cab"><h3><Siren size={18} /> Alertas de brote del periodo</h3></div>
          {d.alertas.map((a) => (
            <div className="fila" key={a.id}>
              <span><b>{a.etiqueta}</b> · {a.cultivo_nombre} · {a.provincia_nombre}</span>
              <span className="tenue">{a.casos} casos · {new Date(a.creado).toLocaleDateString('es-PE')}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
