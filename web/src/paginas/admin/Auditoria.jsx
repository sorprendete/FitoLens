import { RefreshCw, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { admin } from '../../api/cliente'

const ACCIONES = { login: 'Inicio de sesión', registro: 'Registro', diagnostico: 'Diagnóstico', admin: 'Administración' }
const ESTADOS = { exito: ['Éxito', 'ok'], fallo: ['Fallo', 'aviso'], bloqueado: ['Bloqueado', 'mal'] }

export default function Auditoria() {
  const [filas, setFilas] = useState(null)
  const [accion, setAccion] = useState('')
  const [estado, setEstado] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState('')

  const cargar = useCallback(() => {
    setFilas(null)
    try {
      admin.auditoria({ accion, estado })
        .then(setFilas)
        .catch((e) => { setError(e.message); setFilas([]) })
    } catch (e) {
      setError(e.message)
      setFilas([])
    }
  }, [accion, estado])
  useEffect(cargar, [cargar])

  const filasFiltradas = useMemo(() => {
    if (!filas) return []
    const qNorm = q.trim().toLowerCase()
    if (!qNorm) return filas
    return filas.filter((f) => {
      const email = (f.email ?? '').toLowerCase()
      const ip = (f.ip ?? '').toLowerCase()
      const detalle = (f.detalle ?? '').toLowerCase()
      const act = (ACCIONES[f.accion] ?? f.accion ?? '').toLowerCase()
      return email.includes(qNorm) || ip.includes(qNorm) || detalle.includes(qNorm) || act.includes(qNorm)
    })
  }, [filas, q])

  const hayFiltros = Boolean(q.trim() || accion || estado)
  const limpiarFiltros = () => {
    setQ('')
    setAccion('')
    setEstado('')
  }

  return (
    <div className="apilado">
      <p className="tenue">Registro inalterable de cada inicio de sesión, registro, diagnóstico y acción de administración, con IP y navegador.</p>
      <div className="barra-filtros">
        <div className="entrada buscador" style={{ minWidth: 220 }}>
          <Search size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por correo, IP o detalle…"
            aria-label="Buscar en auditoría"
          />
          {q && (
            <button type="button" className="ojo" onClick={() => setQ('')} aria-label="Limpiar">
              <X size={15} />
            </button>
          )}
        </div>
        <div className="segmentado">
          <button aria-pressed={!estado} onClick={() => setEstado('')}>Todos</button>
          {Object.entries(ESTADOS).map(([k, [t]]) => <button key={k} aria-pressed={estado === k} onClick={() => setEstado(k)}>{t}</button>)}
        </div>
        <select value={accion} onChange={(e) => setAccion(e.target.value)} aria-label="Acción">
          <option value="">Todas las acciones</option>
          {Object.entries(ACCIONES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        {hayFiltros && (
          <button className="btn sec" onClick={limpiarFiltros} title="Quitar filtros">
            <X size={16} />Quitar filtros
          </button>
        )}
        <button className="btn sec" onClick={cargar}><RefreshCw size={17} />Actualizar</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="tenue" style={{ fontSize: '.85rem' }}>
          {filas === null
            ? 'Cargando eventos…'
            : filas.length === 0
            ? '0 eventos'
            : filasFiltradas.length === filas.length
            ? `${filas.length} ${filas.length === 1 ? 'evento' : 'eventos'}`
            : `Mostrando ${filasFiltradas.length} de ${filas.length} eventos`}
        </span>
      </div>

      {error && <p className="alerta mal">{error}</p>}
      <section className="tarjeta sin-relleno">
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Acción</th><th>Estado</th><th>Correo</th><th>IP</th><th>Detalle</th></tr></thead>
          <tbody>
            {filas === null && Array.from({ length: 8 }, (_, i) => <tr key={i} className="esqueleto"><td colSpan="6"><i /></td></tr>)}
            {filasFiltradas.map((f) => (
              <tr key={f.id}>
                <td data-l="Fecha">{new Date(f.fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'medium' })}</td>
                <td data-l="Acción" className="principal">{ACCIONES[f.accion] ?? f.accion}</td>
                <td data-l="Estado"><span className={`insignia ${ESTADOS[f.estado]?.[1] ?? 'neutro'}`}>{ESTADOS[f.estado]?.[0] ?? f.estado}</span></td>
                <td data-l="Correo">{f.email || '—'}</td>
                <td data-l="IP"><code>{f.ip}</code></td>
                <td data-l="Detalle" title={f.agente}>{f.detalle || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas && !filasFiltradas.length && (
          <div style={{ textAlign: 'center', padding: '30px 16px' }}>
            <p className="tenue" style={{ marginBottom: 10 }}>Sin eventos con esos filtros.</p>
            {hayFiltros && (
              <button className="btn sec chico" onClick={limpiarFiltros}><X size={15} />Quitar filtros</button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
