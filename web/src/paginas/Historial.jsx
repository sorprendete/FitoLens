import { Download, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { obtenerHistorial } from '../api/cliente'
import { CULTIVOS, esSana, infoClase } from '../datos/clases'
import { PROVINCIAS } from '../datos/provincias'
import { pct } from '../datos/utiles'

const ESTADOS = { diagnostico: 'Concluyente', no_concluyente: 'No concluyente', rechazada: 'Rechazada' }
const nombreProv = Object.fromEntries(PROVINCIAS.map((p) => [p.id, p.nombre]))

export default function Historial() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [cultivo, setCultivo] = useState('')
  const [estado, setEstado] = useState('')
  useEffect(() => { obtenerHistorial(500).then((r) => setItems(r.items ?? [])).catch((e) => { setError(e.message); setItems([]) }) }, [])

  const filas = useMemo(() => (items ?? []).filter((i) =>
    (!cultivo || i.cultivo === cultivo) && (!estado || i.estado === estado) &&
    (!q || `${infoClase(i.clase).nombre} ${nombreProv[i.provincia] ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [items, q, cultivo, estado])

  function exportar() {
    const enc = ['fecha', 'cultivo', 'estado', 'resultado', 'confianza', 'provincia']
    const csv = [enc, ...filas.map((i) => [new Date(i.creado).toLocaleString('es-PE'), CULTIVOS[i.cultivo]?.nombre ?? '', ESTADOS[i.estado],
      i.clase ? infoClase(i.clase).nombre : '', i.confianza != null ? Math.round(i.confianza * 100) : '', nombreProv[i.provincia] ?? ''])]
      .map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    a.download = 'fitolens-historial.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="apilado">
      <div className="barra-filtros">
        <div className="entrada buscador"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar enfermedad o provincia" aria-label="Buscar" /></div>
        <select value={cultivo} onChange={(e) => setCultivo(e.target.value)} aria-label="Cultivo">
          <option value="">Todos los cultivos</option>
          {Object.entries(CULTIVOS).map(([id, c]) => <option key={id} value={id}>{c.nombre}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([id, t]) => <option key={id} value={id}>{t}</option>)}
        </select>
        <button className="btn sec" onClick={exportar} disabled={!filas.length}><Download size={18} />Exportar CSV</button>
      </div>
      {error && <p className="alerta mal">{error}</p>}
      <section className="tarjeta sin-relleno">
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Cultivo</th><th>Resultado</th><th>Confianza</th><th>Provincia</th><th>Estado</th></tr></thead>
          <tbody>
            {items === null && Array.from({ length: 6 }, (_, i) => <tr key={i} className="esqueleto"><td colSpan="6"><i /></td></tr>)}
            {filas.map((i) => (
              <tr key={i.id}>
                <td data-l="Fecha">{new Date(i.creado).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td data-l="Cultivo">{i.cultivo ? <span className="punto-txt" style={{ '--c': CULTIVOS[i.cultivo]?.color }}>{CULTIVOS[i.cultivo]?.nombre}</span> : '—'}</td>
                <td data-l="Resultado" className="principal">{i.clase ? infoClase(i.clase, i.etiqueta).nombre : 'Foto no válida'}</td>
                <td data-l="Confianza">{i.confianza != null ? pct(i.confianza) : '—'}</td>
                <td data-l="Provincia">{nombreProv[i.provincia] ?? '—'}</td>
                <td data-l="Estado"><span className={`insignia ${i.estado === 'rechazada' ? 'neutro' : i.estado === 'no_concluyente' ? 'aviso' : esSana(i.clase) ? 'ok' : 'mal'}`}>
                  {i.estado === 'diagnostico' ? (esSana(i.clase) ? 'Sana' : 'Enferma') : ESTADOS[i.estado]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items && !filas.length && <p className="tenue centro relleno">No hay diagnósticos con esos filtros.</p>}
      </section>
      <p className="tenue pequeno">Solo tú ves tu historial. Se muestran tus últimos 500 diagnósticos.</p>
    </div>
  )
}
