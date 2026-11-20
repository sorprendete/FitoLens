import { Activity, AlertTriangle, Gauge, Leaf, ScanLine } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { obtenerHistorial, obtenerMetricas } from '../api/cliente'
import { Columnas, Dona, Kpi, Ranking } from '../componentes/Graficos'
import { useSesion } from '../contexto/Sesion'
import { CULTIVOS, esSana, infoClase } from '../datos/clases'
import { pct } from '../datos/utiles'

export default function Panel() {
  const { usuario } = useSesion()
  const [items, setItems] = useState(null)
  const [modelos, setModelos] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    obtenerHistorial(500).then((r) => setItems(r.items ?? [])).catch((e) => { setError(e.message); setItems([]) })
    obtenerMetricas().then((m) => setModelos(m.modelos ?? [])).catch(() => {})
  }, [])

  const e = useMemo(() => estadisticas(items ?? []), [items])
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="apilado">
      <section className="bienvenida">
        <div>
          <p className="sobre">{saludo}</p>
          <h2>{usuario?.nombre?.split(' ')[0]}, este es el estado de tus cultivos</h2>
          <p className="tenue">Resumen de tus últimos {items?.length ?? '…'} diagnósticos.</p>
        </div>
        <a className="btn grande" href="#diagnostico"><ScanLine size={20} />Nuevo diagnóstico</a>
      </section>
      {error && <p className="alerta mal">{error}</p>}

      <div className="rejilla-kpi">
        <Kpi icono={Activity} titulo="Diagnósticos" valor={e.total} sub={`${e.semana} en los últimos 7 días`} />
        <Kpi icono={Leaf} titulo="Plantas sanas" valor={pct(e.sanas / (e.concluyentes || 1))} sub={`${e.sanas} de ${e.concluyentes} concluyentes`} tono="ok" />
        <Kpi icono={AlertTriangle} titulo="Con enfermedad" valor={pct(e.enfermas / (e.concluyentes || 1))} sub={`${e.enfermas} casos`} tono="mal" />
        <Kpi icono={Gauge} titulo="Confianza media" valor={pct(e.confianza)} sub={`${e.dudosas} no concluyentes`} tono="aviso" />
      </div>

      {items && !items.length ? (
        <div className="tarjeta vacio">
          <ScanLine size={40} />
          <h3>Aún no tienes diagnósticos</h3>
          <p className="tenue">Toma tu primera foto y aquí verás tus estadísticas.</p>
          <a className="btn" href="#diagnostico">Hacer mi primer diagnóstico</a>
        </div>
      ) : (
        <>
          <section className="tarjeta">
            <header className="tarjeta-cab"><h3>Diagnósticos por día</h3><span className="tenue">Últimos 14 días</span></header>
            <Columnas datos={e.porDia} />
          </section>
          <div className="rejilla-2">
            <section className="tarjeta">
              <header className="tarjeta-cab"><h3>Enfermedades más frecuentes</h3></header>
              {e.top.length ? <Ranking datos={e.top} total={e.enfermas} /> : <p className="tenue">Sin enfermedades detectadas. ¡Bien!</p>}
            </section>
            <section className="tarjeta">
              <header className="tarjeta-cab"><h3>Por cultivo</h3></header>
              <Dona datos={e.porCultivo} centro={e.concluyentes} sub="análisis" />
            </section>
          </div>
        </>
      )}

      {!!modelos.length && (
        <section className="tarjeta">
          <header className="tarjeta-cab"><h3>Modelos en uso</h3><a href="#modelos" className="enlace">Ver precisión en campo →</a></header>
          <div className="modelos-mini">
            {modelos.map((m) => (
              <div key={m.id} className="modelo-mini" style={{ '--c': CULTIVOS[m.cultivo]?.color }}>
                <span>{m.id === 'hortalizas' ? 'Hortalizas' : CULTIVOS[m.cultivo]?.nombre ?? m.id}</span>
                <b>{pct(m.campo?.accuracy)}</b><small>acierto en campo</small>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function estadisticas(items) {
  const conc = items.filter((i) => i.estado === 'diagnostico')
  const sanas = conc.filter((i) => esSana(i.clase)).length
  const conConf = items.filter((i) => i.confianza != null && i.estado !== 'rechazada')
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const porDia = Array.from({ length: 14 }, (_, k) => {
    const d = new Date(hoy - (13 - k) * 864e5)
    const valor = items.filter((i) => { const c = new Date(i.creado); c.setHours(0, 0, 0, 0); return +c === +d }).length
    return { etiqueta: d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', ''), valor }
  })
  const cuenta = {}
  conc.filter((i) => !esSana(i.clase)).forEach((i) => { cuenta[i.clase] = (cuenta[i.clase] || 0) + 1 })
  const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([c, v]) => ({ etiqueta: `${CULTIVOS[c.split('_')[0]]?.nombre ?? ''} · ${infoClase(c).nombre}`, valor: v, color: CULTIVOS[c.split('_')[0]]?.color }))
  const porCultivo = Object.entries(CULTIVOS).map(([id, c]) => ({ etiqueta: c.nombre, color: c.color, valor: conc.filter((i) => i.cultivo === id).length })).filter((d) => d.valor)
  return {
    total: items.length, concluyentes: conc.length, sanas, enfermas: conc.length - sanas,
    dudosas: items.filter((i) => i.estado === 'no_concluyente').length,
    confianza: conConf.reduce((a, i) => a + i.confianza, 0) / (conConf.length || 1),
    semana: items.filter((i) => Date.now() - new Date(i.creado) < 7 * 864e5).length,
    porDia, top, porCultivo,
  }
}
