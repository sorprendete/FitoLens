import { BellRing, MapPin, Send, Trash2, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { alertas as api } from '../../api/cliente'
import AlertasBrote from '../../componentes/AlertasBrote'
import { Kpi } from '../../componentes/Graficos'
import { PROVINCIAS } from '../../datos/provincias'

const VACIO = { chat_id: '', nombre: '', provincia: '' }

// Administración de alertas de brote: brotes vigentes y técnicos que reciben el aviso por Telegram.
export default function Alertas() {
  const [activas, setActivas] = useState(null)
  const [subs, setSubs] = useState(null)
  const [form, setForm] = useState(VACIO)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    api.activas().then(setActivas).catch((e) => setError(e.message))
    api.suscripciones().then(setSubs).catch((e) => setError(e.message))
  }, [])

  async function agregar(e) {
    e.preventDefault()
    setOcupado(true); setError('')
    try {
      const s = await api.suscribir({ ...form, chat_id: form.chat_id.trim(), provincia: form.provincia || null })
      setSubs((l) => [s, ...(l ?? []).filter((x) => x.id !== s.id)]); setForm(VACIO)
    } catch (x) { setError(x.message) } finally { setOcupado(false) }
  }
  async function borrar(s) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`¿Dejar de enviar alertas a ${s.nombre || s.chat_id}?`)) return
    try { await api.borrar(s.id); setSubs((l) => l.filter((x) => x.id !== s.id)) } catch (x) { setError(x.message) }
  }

  const campo = (k) => ({ value: form[k], onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })) })
  const avisados = (activas?.alertas ?? []).reduce((n, a) => n + (a.avisados || 0), 0)

  return (
    <div className="apilado">
      {error && <p className="alerta mal">{error}</p>}
      <div className="rejilla-kpi">
        <Kpi icono={BellRing} titulo="Brotes activos" valor={activas?.alertas.length ?? '…'} tono="mal"
          sub={activas && `${activas.umbral}+ casos en ${activas.ventana_dias} días`} />
        <Kpi icono={UserPlus} titulo="Suscripciones" valor={subs?.length ?? '…'} sub="técnicos y autoridades" />
        <Kpi icono={Send} titulo="Avisos enviados" valor={activas ? avisados : '…'} sub="por Telegram, brotes activos" tono="violeta" />
      </div>
      <AlertasBrote datos={activas} alElegir={() => { location.hash = 'brotes' }} />

      <section className="tarjeta">
        <header className="tarjeta-cab"><h3>Agregar técnico</h3><span className="tenue pequeno">Lo normal es que cada técnico escriba /alertas al bot. Aquí puedes agregarlo a mano.</span></header>
        <form className="barra-filtros" onSubmit={agregar}>
          <label className="entrada buscador"><input required pattern="-?\d{1,20}" placeholder="ID de chat de Telegram (p. ej. 123456789)" {...campo('chat_id')} /></label>
          <label className="entrada"><input maxLength={120} placeholder="Nombre o institución" {...campo('nombre')} /></label>
          <select aria-label="Provincia" {...campo('provincia')}>
            <option value="">Todas las provincias</option>
            {PROVINCIAS.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button className="btn" disabled={ocupado}><UserPlus size={16} />Agregar</button>
        </form>
      </section>

      <section className="tarjeta sin-relleno">
        <header className="tarjeta-cab relleno"><h3>Quiénes reciben las alertas</h3><span className="tenue">{subs?.length ?? 0} suscripciones</span></header>
        {subs?.length === 0 && <div className="vacio"><BellRing /><h3>Nadie suscrito todavía</h3><p>Pide a los técnicos que escriban /alertas al bot de FitoLens.</p></div>}
        {!!subs?.length && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr><th>Nombre</th><th>Chat de Telegram</th><th>Provincia</th><th>Desde</th><th /></tr></thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td data-l="Nombre" className="principal"><b>{s.nombre || 'Sin nombre'}</b></td>
                    <td data-l="Chat"><code>{s.chat_id}</code></td>
                    <td data-l="Provincia"><span className="insignia neutro"><MapPin size={12} />{s.provincia_nombre}</span></td>
                    <td data-l="Desde">{new Date(s.creado).toLocaleDateString('es-PE', { dateStyle: 'medium' })}</td>
                    <td><button className="btn chico peligro" onClick={() => borrar(s)} aria-label="Quitar"><Trash2 size={14} />Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
