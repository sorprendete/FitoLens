import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { admin } from '../../api/cliente'

const ACCIONES = { login: 'Inicio de sesión', registro: 'Registro', diagnostico: 'Diagnóstico', admin: 'Administración' }
const ESTADOS = { exito: ['Éxito', 'ok'], fallo: ['Fallo', 'aviso'], bloqueado: ['Bloqueado', 'mal'] }

export default function Auditoria() {
  const [filas, setFilas] = useState(null)
  const [accion, setAccion] = useState('')
  const [estado, setEstado] = useState('')
  const [error, setError] = useState('')
  const cargar = useCallback(() => {
    setFilas(null)
    admin.auditoria({ accion, estado }).then(setFilas).catch((e) => { setError(e.message); setFilas([]) })
  }, [accion, estado])
  useEffect(cargar, [cargar])

  return (
    <div className="apilado">
      <p className="tenue">Registro inalterable de cada inicio de sesión, registro, diagnóstico y acción de administración, con IP y navegador.</p>
      <div className="barra-filtros">
        <div className="segmentado">
          <button aria-pressed={!estado} onClick={() => setEstado('')}>Todos</button>
          {Object.entries(ESTADOS).map(([k, [t]]) => <button key={k} aria-pressed={estado === k} onClick={() => setEstado(k)}>{t}</button>)}
        </div>
        <select value={accion} onChange={(e) => setAccion(e.target.value)} aria-label="Acción">
          <option value="">Todas las acciones</option>
          {Object.entries(ACCIONES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <button className="btn sec" onClick={cargar}><RefreshCw size={17} />Actualizar</button>
      </div>
      {error && <p className="alerta mal">{error}</p>}
      <section className="tarjeta sin-relleno">
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Acción</th><th>Estado</th><th>Correo</th><th>IP</th><th>Detalle</th></tr></thead>
          <tbody>
            {filas === null && Array.from({ length: 8 }, (_, i) => <tr key={i} className="esqueleto"><td colSpan="6"><i /></td></tr>)}
            {filas?.map((f) => (
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
        {filas && !filas.length && <p className="tenue centro relleno">Sin eventos con esos filtros.</p>}
      </section>
    </div>
  )
}
