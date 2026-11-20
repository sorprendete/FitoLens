import { BellRing, Send, Siren } from 'lucide-react'
import { CULTIVOS, infoClase } from '../datos/clases'
import { PROVINCIAS } from '../datos/provincias'

const nombreProv = (id) => PROVINCIAS.find((p) => p.id === id)?.nombre ?? id
const hace = (f) => {
  const d = Math.floor((Date.now() - new Date(f)) / 864e5)
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`
}

// Brotes vigentes: N casos de la misma enfermedad en la misma provincia dentro de la ventana.
// Rojo = enfermedad (paleta semántica); el punto de color es el del cultivo.
export default function AlertasBrote({ datos, alElegir, compacto = false }) {
  if (!datos) return null
  const { alertas: lista, umbral, ventana_dias: dias } = datos
  if (!lista.length) {
    return compacto ? null : (
      <div className="tarjeta alertas-brote vacia">
        <BellRing size={20} />
        <p className="tenue">Sin brotes activos. Se avisa cuando una provincia llega a {umbral} casos de la misma enfermedad en {dias} días.</p>
      </div>
    )
  }
  return (
    <section className="tarjeta alertas-brote" aria-live="polite">
      <header className="tarjeta-cab">
        <h3><Siren size={18} /> {lista.length === 1 ? '1 alerta de brote activa' : `${lista.length} alertas de brote activas`}</h3>
        <span className="tenue pequeno">{umbral} o más casos de la misma enfermedad en {dias} días</span>
      </header>
      <ul>
        {lista.map((a) => {
          const cultivo = CULTIVOS[a.cultivo]
          return (
            <li key={a.id}>
              <button className="alerta-item" onClick={() => alElegir?.(a.provincia)}>
                <span className="alerta-pulso" aria-hidden="true" />
                <span className="alerta-texto">
                  <b>{nombreProv(a.provincia)}</b>
                  <span><b className="mal-txt">{a.casos} casos</b> de {infoClase(a.clase).nombre}
                    {' · '}<i className="punto" style={{ background: cultivo?.color }} />{cultivo?.nombre ?? a.cultivo}</span>
                </span>
                <span className="alerta-meta tenue pequeno">
                  <span>desde {hace(a.creado)}</span>
                  <span><Send size={12} /> {a.avisados ? `${a.avisados} técnico${a.avisados > 1 ? 's' : ''} avisado${a.avisados > 1 ? 's' : ''}` : 'Telegram'}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {!compacto && <p className="tenue pequeno">Técnicos y autoridades: escriban <b>/alertas</b> al bot de FitoLens en Telegram para recibir estos avisos de su provincia.</p>}
    </section>
  )
}
