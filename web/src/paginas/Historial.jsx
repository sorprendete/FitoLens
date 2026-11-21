import { Download, Search, Smartphone, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { borrarDiagnostico, dispositivos, obtenerHistorial, parcelas } from '../api/cliente'
import { CULTIVOS, esSana, infoClase } from '../datos/clases'
import { PROVINCIAS } from '../datos/provincias'
import { pct } from '../datos/utiles'

const ESTADOS = { diagnostico: 'Concluyente', no_concluyente: 'No concluyente', rechazada: 'Rechazada' }
const ORIGENES = { web: 'Web', app: 'App', bot: 'Telegram' }
const nombreProv = Object.fromEntries(PROVINCIAS.map((p) => [p.id, p.nombre]))

export default function Historial() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [listaParcelas, setListaParcelas] = useState([])
  const [q, setQ] = useState('')
  const [cultivo, setCultivo] = useState('')
  const [estado, setEstado] = useState('')
  const [urgencia, setUrgencia] = useState('')
  const [fecha, setFecha] = useState('')
  const [orden, setOrden] = useState('recientes')

  const cargar = useCallback(() => {
    try {
      obtenerHistorial(500)
        .then((r) => setItems(r.items ?? []))
        .catch((e) => { setError(e.message); setItems([]) })
    } catch (e) {
      setError(e.message)
      setItems([])
    }
  }, [])

  useEffect(() => {
    cargar()
    parcelas.listar().then((r) => setListaParcelas(r.items ?? [])).catch(() => {})
  }, [cargar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  async function agregarAParcela(diagId, parcelaId) {
    if (!parcelaId) return
    setError('')
    try {
      await parcelas.agregarDiagnostico(parcelaId, { diagnostico_id: diagId })
      setAviso('Diagnóstico agregado a la parcela.')
      cargar()
    } catch (e) {
      setError(e.message)
    }
  }

  async function quitarDeParcela(parcelaId, diagId) {
    setError('')
    try {
      await parcelas.quitarDiagnostico(parcelaId, diagId)
      setAviso('Diagnóstico quitado de la parcela.')
      cargar()
    } catch (e) {
      setError(e.message)
    }
  }

  async function borrar(id) {
    if (!window.confirm('Se borrara este diagnostico. No se puede deshacer.')) return
    setError('')
    try {
      await borrarDiagnostico(id)
      setAviso('Diagnóstico eliminado.')
      cargar()
    } catch (e) {
      setError(e.message)
    }
  }

  const filas = useMemo(() => {
    if (!items) return []
    const qNorm = q.trim().toLowerCase()
    const ahora = Date.now()
    const hoy = new Date()

    const filtradas = items.filter((i) => {
      // 1. Cultivo
      if (cultivo && i.cultivo !== cultivo) return false

      // 2. Estado
      if (estado) {
        if (estado === 'sana') {
          if (i.estado !== 'diagnostico' || !i.clase || !esSana(i.clase)) return false
        } else if (estado === 'enferma') {
          if (i.estado !== 'diagnostico' || !i.clase || esSana(i.clase)) return false
        } else if (estado === 'no_concluyente') {
          if (i.estado !== 'no_concluyente') return false
        } else if (estado === 'rechazada') {
          if (i.estado !== 'rechazada') return false
        }
      }

      // 3. Urgencia
      if (urgencia) {
        const urg = i.clase ? infoClase(i.clase, i.etiqueta).urgencia : 'ninguna'
        if (urg !== urgencia) return false
      }

      // 4. Rango de fecha
      if (fecha) {
        const d = new Date(i.creado)
        if (fecha === 'hoy') {
          if (d.getDate() !== hoy.getDate() || d.getMonth() !== hoy.getMonth() || d.getFullYear() !== hoy.getFullYear()) return false
        } else if (fecha === '7dias') {
          if (ahora - d.getTime() > 7 * 864e5) return false
        } else if (fecha === '30dias') {
          if (ahora - d.getTime() > 30 * 864e5) return false
        }
      }

      // 5. Búsqueda por texto (enfermedad, cultivo, provincia, notas)
      if (qNorm) {
        const enf = i.clase ? infoClase(i.clase, i.etiqueta).nombre.toLowerCase() : (i.estado === 'rechazada' ? 'foto no válida' : 'no concluyente')
        const cult = (CULTIVOS[i.cultivo]?.nombre ?? i.cultivo ?? '').toLowerCase()
        const prov = (nombreProv[i.provincia] ?? i.provincia ?? '').toLowerCase()
        const notas = (i.motivo ?? i.notas ?? i.detalle ?? '').toLowerCase()
        const orig = (ORIGENES[i.origen] ?? '').toLowerCase()
        if (!enf.includes(qNorm) && !cult.includes(qNorm) && !prov.includes(qNorm) && !notas.includes(qNorm) && !orig.includes(qNorm)) return false
      }

      return true
    })

    filtradas.sort((a, b) => {
      const tA = new Date(a.creado).getTime()
      const tB = new Date(b.creado).getTime()
      return orden === 'recientes' ? tB - tA : tA - tB
    })

    return filtradas
  }, [items, q, cultivo, estado, urgencia, fecha, orden])

  const hayFiltros = Boolean(q.trim() || cultivo || estado || urgencia || fecha || orden !== 'recientes')
  const limpiarFiltros = () => {
    setQ('')
    setCultivo('')
    setEstado('')
    setUrgencia('')
    setFecha('')
    setOrden('recientes')
  }

  function exportar() {
    const enc = ['fecha', 'cultivo', 'estado', 'resultado', 'urgencia', 'confianza', 'provincia', 'desde', 'parcela']
    const csv = [enc, ...filas.map((i) => [
      new Date(i.creado).toLocaleString('es-PE'),
      CULTIVOS[i.cultivo]?.nombre ?? '',
      i.estado === 'diagnostico' ? (esSana(i.clase) ? 'Sana' : 'Enferma') : ESTADOS[i.estado] ?? i.estado,
      i.clase ? infoClase(i.clase, i.etiqueta).nombre : 'Foto no válida',
      i.clase ? infoClase(i.clase, i.etiqueta).urgencia : 'ninguna',
      i.confianza != null ? Math.round(i.confianza * 100) : '',
      nombreProv[i.provincia] ?? '',
      ORIGENES[i.origen] ?? '',
      i.parcela_nombre ?? ''
    ])].map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }))
    a.download = 'fitolens-historial.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="apilado">
      <div className="barra-filtros">
        <div className="entrada buscador">
          <Search size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar enfermedad, cultivo, provincia, notas…"
            aria-label="Buscar"
          />
          {q && (
            <button type="button" className="ojo" onClick={() => setQ('')} aria-label="Limpiar búsqueda">
              <X size={15} />
            </button>
          )}
        </div>

        <select value={cultivo} onChange={(e) => setCultivo(e.target.value)} aria-label="Cultivo">
          <option value="">Todos los cultivos</option>
          {Object.entries(CULTIVOS).map(([id, c]) => <option key={id} value={id}>{c.nombre}</option>)}
        </select>

        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="enferma">Enferma</option>
          <option value="sana">Sana</option>
          <option value="no_concluyente">No concluyente</option>
          <option value="rechazada">Foto rechazada</option>
        </select>

        <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)} aria-label="Urgencia">
          <option value="">Todas las urgencias</option>
          <option value="critica">Crítica (hoy)</option>
          <option value="alta">Alta (1 o 2 días)</option>
          <option value="media">Media (esta semana)</option>
          <option value="ninguna">Ninguna / Sana</option>
        </select>

        <select value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Rango de fecha">
          <option value="">Todas las fechas</option>
          <option value="hoy">Hoy</option>
          <option value="7dias">Últimos 7 días</option>
          <option value="30dias">Últimos 30 días</option>
        </select>

        <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Orden">
          <option value="recientes">Recientes primero</option>
          <option value="antiguos">Antiguos primero</option>
        </select>

        {hayFiltros && (
          <button className="btn sec" onClick={limpiarFiltros} title="Quitar todos los filtros">
            <X size={16} />Quitar filtros
          </button>
        )}

        <button className="btn sec" onClick={exportar} disabled={!filas.length}><Download size={18} />Exportar CSV</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span className="tenue" style={{ fontSize: '.85rem' }}>
          {items === null
            ? 'Cargando diagnósticos…'
            : items.length === 0
            ? '0 diagnósticos'
            : filas.length === items.length
            ? `${items.length} ${items.length === 1 ? 'diagnóstico' : 'diagnósticos'}`
            : `Mostrando ${filas.length} de ${items.length} diagnósticos`}
        </span>
        {hayFiltros && (
          <button className="btn sec chico" onClick={limpiarFiltros} style={{ padding: '3px 8px', fontSize: '.78rem' }}>
            Quitar filtros
          </button>
        )}
      </div>

      {aviso && <p className="alerta ok">{aviso}</p>}
      {error && <p className="alerta mal">{error}</p>}
      <section className="tarjeta sin-relleno">
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Cultivo</th><th>Resultado</th><th>Confianza</th><th>Provincia</th><th>Desde</th><th>Estado</th><th>Parcela</th><th>Acciones</th></tr></thead>
          <tbody>
            {items === null && Array.from({ length: 6 }, (_, i) => <tr key={i} className="esqueleto"><td colSpan="9"><i /></td></tr>)}
            {filas.map((i) => (
              <tr key={i.id}>
                <td data-l="Fecha">{new Date(i.creado).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td data-l="Cultivo">{i.cultivo ? <span className="punto-txt" style={{ '--c': CULTIVOS[i.cultivo]?.color }}>{CULTIVOS[i.cultivo]?.nombre}</span> : '—'}</td>
                <td data-l="Resultado" className="principal">
                  {i.clase ? infoClase(i.clase, i.etiqueta).nombre : 'Foto no válida'}
                  {i.clase && infoClase(i.clase, i.etiqueta).urgencia !== 'ninguna' && (
                    <small className="tenue" style={{ display: 'block', fontSize: '.75rem', color: infoClase(i.clase, i.etiqueta).urgencia === 'critica' || infoClase(i.clase, i.etiqueta).urgencia === 'alta' ? 'var(--mal)' : 'var(--aviso)' }}>
                      Urgencia {infoClase(i.clase, i.etiqueta).urgencia}
                    </small>
                  )}
                </td>
                <td data-l="Confianza">{i.confianza != null ? pct(i.confianza) : '—'}</td>
                <td data-l="Provincia">{nombreProv[i.provincia] ?? '—'}</td>
                <td data-l="Desde">{ORIGENES[i.origen] ?? '—'}</td>
                <td data-l="Estado"><span className={`insignia ${i.estado === 'rechazada' ? 'neutro' : i.estado === 'no_concluyente' ? 'aviso' : esSana(i.clase) ? 'ok' : 'mal'}`}>
                  {i.estado === 'diagnostico' ? (esSana(i.clase) ? 'Sana' : 'Enferma') : ESTADOS[i.estado]}</span></td>
                <td data-l="Parcela">
                  {i.parcela_nombre ? (
                    <span className="insignia neutro" title="Parcela asignada">{i.parcela_nombre}</span>
                  ) : (
                    <span className="tenue">—</span>
                  )}
                </td>
                <td data-l="Acciones">
                  <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {i.parcela_id ? (
                      <button
                        type="button"
                        className="btn sec chico"
                        onClick={() => quitarDeParcela(i.parcela_id, i.id)}
                        title="Quitar de la parcela"
                      >
                        Quitar de la parcela
                      </button>
                    ) : (
                      <select
                        className="btn sec chico"
                        style={{ padding: '4px 8px', fontSize: '.78rem', cursor: 'pointer' }}
                        value=""
                        onChange={(e) => agregarAParcela(i.id, e.target.value)}
                        aria-label="Agregar a parcela"
                      >
                        <option value="" disabled>Agregar a parcela…</option>
                        {listaParcelas.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="btn sec chico peligro"
                      style={{ padding: '4px 8px', fontSize: '.78rem' }}
                      onClick={() => borrar(i.id)}
                      title="Borrar diagnóstico"
                    >
                      Borrar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items && !filas.length && (
          <div style={{ textAlign: 'center', padding: '36px 16px' }}>
            <p className="tenue" style={{ marginBottom: 10 }}>
              {items.length === 0 ? 'Aún no hay diagnósticos registrados.' : 'No hay diagnósticos que coincidan con los filtros aplicados.'}
            </p>
            {hayFiltros && (
              <button className="btn sec chico" onClick={limpiarFiltros}><X size={15} />Quitar filtros</button>
            )}
          </div>
        )}
      </section>
      <p className="tenue pequeno">Solo tú ves tu historial. Se muestran tus últimos 500 diagnósticos.</p>
      <Telefonos />
    </div>
  )
}

// Teléfonos donde se inició sesión con la app. Lo que diagnostican sin internet llega aquí al volver la señal.
function Telefonos() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const cargar = () => {
    try {
      dispositivos.listar().then(setLista).catch((e) => { setError(e.message); setLista([]) })
    } catch (e) {
      setError(e.message)
      setLista([])
    }
  }
  useEffect(() => { cargar() }, [])
  const desvincular = async (d) => {
    if (!window.confirm(`¿Desvincular "${d.nombre}"? Lo ya subido se queda; lo pendiente se queda en el teléfono.`)) return
    try { await dispositivos.desvincular(d.id); cargar() } catch (e) { setError(e.message) }
  }
  if (!lista?.length && !error) return null
  return (
    <section className="tarjeta">
      <h3><Smartphone size={18} /> Teléfonos vinculados</h3>
      <p className="tenue pequeno">Si pierdes un teléfono, desvincúlalo: dejará de poder subir datos a tu cuenta.</p>
      {error && <p className="alerta mal">{error}</p>}
      <table className="tabla">
        <thead><tr><th>Teléfono</th><th>Vinculado</th><th>Último uso</th><th /></tr></thead>
        <tbody>
          {(lista ?? []).map((d) => (
            <tr key={d.id}>
              <td data-l="Teléfono" className="principal">{d.nombre}</td>
              <td data-l="Vinculado">{new Date(d.creado).toLocaleDateString('es-PE', { dateStyle: 'medium' })}</td>
              <td data-l="Último uso">{d.ultimo_uso ? new Date(d.ultimo_uso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
              <td><button className="btn sec" onClick={() => desvincular(d)}>Desvincular</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
