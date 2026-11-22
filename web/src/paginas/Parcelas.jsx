import { ArrowLeft, Camera, MapPin, Plus, Search, Sprout, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { diagnosticar, obtenerHistorial, parcelas as api } from '../api/cliente'
import { Leyenda } from '../componentes/Graficos'
import { CULTIVOS, esSana, infoClase } from '../datos/clases'
import { PROVINCIAS } from '../datos/provincias'
import { SEVERIDAD, TENDENCIA } from '../datos/severidad'
import { pct, provinciaDe, reducir } from '../datos/utiles'
import './Parcelas.css'

// Seguimiento de parcelas: registrar la parcela, anotar visitas (foto + severidad + tratamiento)
// y ver en una línea de tiempo si mejora después del tratamiento.
const nombreProv = Object.fromEntries(PROVINCIAS.map((p) => [p.id, p.nombre]))
const fecha = (f) => new Date(f).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Parcelas() {
  const [abierta, setAbierta] = useState(null)
  return abierta ? <Detalle id={abierta} onVolver={() => setAbierta(null)} /> : <Lista onAbrir={setAbierta} />
}

function Lista({ onAbrir }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [nueva, setNueva] = useState(false)
  const [q, setQ] = useState('')
  const [cultivo, setCultivo] = useState('')

  const cargar = useCallback(() => {
    try {
      api.listar().then((r) => setItems(r.items)).catch((e) => { setError(e.message); setItems([]) })
    } catch (e) {
      setError(e.message)
      setItems([])
    }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const filas = useMemo(() => {
    if (!items) return []
    const qNorm = q.trim().toLowerCase()
    return items.filter((p) => {
      if (cultivo && p.cultivo !== cultivo) return false
      if (qNorm) {
        const nom = (p.nombre ?? '').toLowerCase()
        const prov = (nombreProv[p.provincia] ?? p.provincia ?? '').toLowerCase()
        const cult = (CULTIVOS[p.cultivo]?.nombre ?? p.cultivo ?? '').toLowerCase()
        if (!nom.includes(qNorm) && !prov.includes(qNorm) && !cult.includes(qNorm)) return false
      }
      return true
    })
  }, [items, q, cultivo])

  const hayFiltros = Boolean(q.trim() || cultivo)
  const limpiarFiltros = () => {
    setQ('')
    setCultivo('')
  }

  return (
    <div className="apilado">
      <div className="barra-filtros">
        <div className="entrada buscador" style={{ minWidth: 200 }}>
          <Search size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar parcela por nombre o lugar…"
            aria-label="Buscar parcela"
          />
          {q && (
            <button type="button" className="ojo" onClick={() => setQ('')} aria-label="Limpiar">
              <X size={15} />
            </button>
          )}
        </div>

        <select value={cultivo} onChange={(e) => setCultivo(e.target.value)} aria-label="Cultivo">
          <option value="">Todos los cultivos</option>
          {Object.entries(CULTIVOS).map(([id, c]) => <option key={id} value={id}>{c.nombre}</option>)}
        </select>

        {hayFiltros && (
          <button className="btn sec" onClick={limpiarFiltros} title="Quitar filtros">
            <X size={16} />Quitar filtros
          </button>
        )}

        <button className="btn" onClick={() => setNueva((v) => !v)} style={{ marginLeft: 'auto' }}>
          <Plus size={18} />Nueva parcela
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="tenue" style={{ fontSize: '.85rem' }}>
          {items === null
            ? 'Cargando parcelas…'
            : items.length === 0
            ? '0 parcelas'
            : filas.length === items.length
            ? `${items.length} ${items.length === 1 ? 'parcela' : 'parcelas'}`
            : `Mostrando ${filas.length} de ${items.length} parcelas`}
        </span>
      </div>

      {error && <p className="alerta mal">{error}</p>}
      {nueva && <FormParcela onListo={(p) => { setNueva(false); onAbrir(p.id) }} />}
      {items && !items.length && !nueva && (
        <div className="tarjeta vacio">
          <Sprout size={40} />
          <h3>Aún no registras parcelas</h3>
          <p className="tenue">Crea tu primera parcela y agrega una visita cada semana.</p>
          <button className="btn" onClick={() => setNueva(true)}>Registrar mi parcela</button>
        </div>
      )}
      {items && items.length > 0 && !filas.length && !nueva && (
        <div className="tarjeta vacio">
          <p className="tenue">No se encontraron parcelas con los filtros actuales.</p>
          <button className="btn sec" onClick={limpiarFiltros}><X size={16} />Quitar filtros</button>
        </div>
      )}
      <div className="rejilla-3">
        {items === null && Array.from({ length: 3 }, (_, i) => <div key={i} className="tarjeta esqueleto parcela-tarjeta" />)}
        {filas.map((p) => (
          <button key={p.id} className="tarjeta parcela-tarjeta" onClick={() => onAbrir(p.id)}>
            <span className="punto-txt" style={{ '--c': CULTIVOS[p.cultivo]?.color }}>{CULTIVOS[p.cultivo]?.nombre}</span>
            <h3>{p.nombre}</h3>
            <small className="tenue">{nombreProv[p.provincia] ?? 'Sin provincia'} · {p.visitas} {p.visitas === 1 ? 'visita' : 'visitas'}</small>
            <div className="parcela-pie">
              {p.severidad_actual != null ? <Severidad v={p.severidad_actual} /> : <span className="tenue pequeno">Sin visitas</span>}
              <Tendencia t={p.tendencia} />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function FormParcela({ onListo }) {
  const [d, setD] = useState({ nombre: '', cultivo: 'cafe', provincia: '' })
  const [gps, setGps] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const cambiar = (k) => (e) => setD({ ...d, [k]: e.target.value })

  function ubicar() {
    setGps('Buscando…')
    navigator.geolocation?.getCurrentPosition(({ coords }) => {
      const prov = provinciaDe(coords.latitude, coords.longitude)
      setD((x) => ({ ...x, latitud: coords.latitude, longitud: coords.longitude, provincia: prov ?? x.provincia }))
      setGps(prov ? `Ubicación guardada (${nombreProv[prov]})` : 'Ubicación guardada (fuera de San Martín)')
    }, () => setGps('Sin permiso de ubicación'), { timeout: 8000 })
  }

  async function guardar(e) {
    e.preventDefault(); setEnviando(true); setError('')
    try { onListo(await api.crear({ ...d, provincia: d.provincia || null })) } catch (x) { setError(x.message) } finally { setEnviando(false) }
  }

  return (
    <form className="tarjeta" onSubmit={guardar}>
      <header className="tarjeta-cab"><h3>Nueva parcela</h3></header>
      <div className="rejilla-3">
        <label className="campo"><span>Nombre</span><div className="entrada"><input required minLength={2} maxLength={80} value={d.nombre} onChange={cambiar('nombre')} placeholder="Ej.: Cafetal La Loma" /></div></label>
        <label className="campo"><span>Cultivo</span><select value={d.cultivo} onChange={cambiar('cultivo')}>
          {Object.entries(CULTIVOS).map(([id, c]) => <option key={id} value={id}>{c.nombre}</option>)}</select></label>
        <label className="campo"><span>Provincia</span><select value={d.provincia} onChange={cambiar('provincia')}>
          <option value="">Sin indicar</option>{PROVINCIAS.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
      </div>
      {error && <p className="alerta mal">{error}</p>}
      <div className="acciones">
        <button className="btn" disabled={enviando}>{enviando ? <span className="girando" /> : <Plus size={18} />}Guardar parcela</button>
        <button type="button" className="btn sec" onClick={ubicar}><MapPin size={18} />Usar mi ubicación</button>
        {gps && <span className="tenue pequeno">{gps}</span>}
      </div>
    </form>
  )
}

function Detalle({ id, onVolver }) {
  const [p, setP] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [mostrarAgregar, setMostrarAgregar] = useState(false)
  const cargar = useCallback(() => api.detalle(id).then(setP).catch((e) => setError(e.message)), [id])
  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  async function borrarParcela() {
    if (!window.confirm(`¿Borrar la parcela "${p.nombre}"? Los diagnósticos se conservan en tu historial.`)) return
    try { await api.borrar(id); onVolver() } catch (e) { setError(e.message) }
  }
  async function borrarVisita(v) {
    try { await api.borrarVisita(id, v.id); cargar() } catch (e) { setError(e.message) }
  }
  async function quitarDiag(diagId) {
    try {
      await api.quitarDiagnostico(id, diagId)
      setAviso('Diagnóstico quitado de la parcela.')
      cargar()
    } catch (e) {
      setError(e.message)
    }
  }

  if (!p) return error ? <p className="alerta mal">{error}</p> : <div className="tarjeta esqueleto parcela-tarjeta" />
  const t = TENDENCIA[p.tendencia]
  return (
    <div className="apilado">
      <div className="barra-filtros">
        <button className="btn sec chico" onClick={onVolver}><ArrowLeft size={16} />Mis parcelas</button>
        <button className="btn chico" onClick={() => setMostrarAgregar((v) => !v)}><Plus size={16} />Agregar diagnósticos</button>
        <span style={{ flex: 1 }} />
        <button className="btn peligro chico" onClick={borrarParcela}><Trash2 size={16} />Borrar parcela</button>
      </div>
      {aviso && <p className="alerta ok">{aviso}</p>}
      {error && <p className="alerta mal">{error}</p>}

      {mostrarAgregar && (
        <ModalAgregarDiagnosticos
          parcela={p}
          onCerrar={() => setMostrarAgregar(false)}
          onListo={() => {
            setMostrarAgregar(false)
            setAviso('Diagnósticos agregados a la parcela.')
            cargar()
          }}
        />
      )}

      <section className="tarjeta destacada">
        <div style={{ flex: 1 }}>
          <span className="punto-txt" style={{ '--c': CULTIVOS[p.cultivo]?.color }}>{CULTIVOS[p.cultivo]?.nombre}</span>
          <h2 style={{ margin: '6px 0' }}>{p.nombre}</h2>
          <p className="tenue" style={{ margin: 0 }}>{nombreProv[p.provincia] ?? 'Sin provincia'} · registrada el {fecha(p.creado)}</p>
        </div>
        <div className="parcela-estado">
          {p.severidad_actual != null && <Severidad v={p.severidad_actual} grande />}
          <span className={`insignia ${t.clase}`}>{p.tendencia === 'mejora' ? <TrendingDown size={14} /> : p.tendencia === 'empeora' ? <TrendingUp size={14} /> : null}{t.nombre}</span>
        </div>
      </section>

      <section className="tarjeta">
        <header className="tarjeta-cab"><h3>Severidad en el tiempo</h3><span className="tenue pequeno">Las líneas punteadas marcan cada tratamiento</span></header>
        {p.historial.length ? <Linea visitas={p.historial} /> : <p className="tenue">Agrega la primera visita para empezar la línea de tiempo.</p>}
        <Leyenda items={SEVERIDAD.map((s) => ({ nombre: `${s.valor} · ${s.nombre}`, color: s.color }))} />
      </section>

      <div className="rejilla-2 ancha-izq">
        <section className="tarjeta sin-relleno">
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Severidad</th><th>Diagnóstico IA</th><th>Tratamiento / nota</th><th>Acciones</th></tr></thead>
              <tbody>
                {[...p.historial].reverse().map((v) => (
                  <tr key={v.id}>
                    <td data-l="Fecha">{fecha(v.fecha)}</td>
                    <td data-l="Severidad"><Severidad v={v.severidad} /></td>
                    <td data-l="Diagnóstico IA">{v.clase ? `${infoClase(v.clase).nombre} (${pct(v.confianza)})` : v.estado === 'no_concluyente' ? 'No concluyente' : '—'}</td>
                    <td data-l="Tratamiento / nota">{v.tratamiento && <b className="bloque-txt">{v.tratamiento}</b>}{v.nota && <span className="tenue">{v.nota}</span>}{!v.tratamiento && !v.nota && '—'}</td>
                    <td data-l="Acciones">
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {v.diagnostico_id && (
                          <button
                            type="button"
                            className="btn sec chico"
                            onClick={() => quitarDiag(v.diagnostico_id)}
                            title="Quitar de la parcela"
                          >
                            Quitar
                          </button>
                        )}
                        <button className="icono-btn" onClick={() => borrarVisita(v)} aria-label="Borrar visita" title="Borrar visita"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!p.historial.length && <p className="tenue centro relleno">Sin visitas todavía.</p>}
        </section>
        <FormVisita parcela={p} onListo={cargar} />
      </div>
    </div>
  )
}

function ModalAgregarDiagnosticos({ parcela, onCerrar, onListo }) {
  const [diags, setDiags] = useState([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    obtenerHistorial(200, { sin_parcela: true })
      .then((r) => {
        setDiags(r.items ?? [])
        setCargando(false)
      })
      .catch((e) => {
        setError(e.message)
        setCargando(false)
      })
  }, [])

  const filtrados = useMemo(() => {
    const qNorm = q.trim().toLowerCase()
    return diags.filter((d) => {
      if (qNorm) {
        const enf = d.clase ? infoClase(d.clase, d.etiqueta).nombre.toLowerCase() : 'no concluyente'
        const cult = (CULTIVOS[d.cultivo]?.nombre ?? d.cultivo ?? '').toLowerCase()
        const prov = (nombreProv[d.provincia] ?? d.provincia ?? '').toLowerCase()
        if (!enf.includes(qNorm) && !cult.includes(qNorm) && !prov.includes(qNorm)) return false
      }
      return true
    })
  }, [diags, q])

  const alternar = (id) => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const alternarTodos = () => {
    if (seleccionados.size === filtrados.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(filtrados.map((d) => d.id)))
    }
  }

  async function guardar() {
    if (!seleccionados.size) return
    setGuardando(true)
    setError('')
    try {
      for (const diagId of seleccionados) {
        await api.agregarDiagnostico(parcela.id, { diagnostico_id: diagId })
      }
      onListo()
    } catch (e) {
      setError(e.message)
      setGuardando(false)
    }
  }

  return (
    <div className="tarjeta" style={{ border: '2px solid var(--acento)', animation: 'subir .25s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Agregar diagnósticos a {parcela.nombre}</h3>
        <button type="button" className="ojo" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
      </div>
      <p className="tenue pequeno" style={{ margin: '0 0 12px' }}>
        Diagnósticos sin parcela asignada disponibles para agregar a esta parcela.
      </p>

      <div className="entrada buscador" style={{ marginBottom: 12 }}>
        <Search size={16} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por enfermedad, cultivo o provincia…"
          aria-label="Buscar diagnósticos"
        />
        {q && <button type="button" className="ojo" onClick={() => setQ('')}><X size={14} /></button>}
      </div>

      {error && <p className="alerta mal">{error}</p>}

      {cargando ? (
        <p className="tenue">Cargando diagnósticos sin parcela…</p>
      ) : diags.length === 0 ? (
        <p className="tenue">No hay diagnósticos sin parcela disponibles.</p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <button type="button" className="btn sec chico" onClick={alternarTodos}>
              {seleccionados.size === filtrados.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
            <span className="tenue pequeno">{seleccionados.size} de {filtrados.length} seleccionados</span>
          </div>

          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--borde)', borderRadius: 10, padding: 6, display: 'grid', gap: 6 }}>
            {filtrados.map((d) => {
              const sel = seleccionados.has(d.id)
              return (
                <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8, background: sel ? 'color-mix(in srgb, var(--acento) 12%, transparent)' : 'var(--fondo-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={sel} onChange={() => alternar(d.id)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{d.clase ? infoClase(d.clase, d.etiqueta).nombre : 'No concluyente'}</div>
                    <small className="tenue">
                      {CULTIVOS[d.cultivo]?.nombre ?? d.cultivo ?? '—'} · {fecha(d.creado)} · {nombreProv[d.provincia] ?? d.provincia ?? '—'}
                    </small>
                  </div>
                </label>
              )
            })}
            {filtrados.length === 0 && <p className="tenue centro relleno">No hay diagnósticos que coincidan con la búsqueda.</p>}
          </div>

          <div className="acciones" style={{ marginTop: 14 }}>
            <button type="button" className="btn" disabled={!seleccionados.size || guardando} onClick={guardar}>
              {guardando ? 'Guardando…' : `Agregar ${seleccionados.size} diagnóstico${seleccionados.size === 1 ? '' : 's'}`}
            </button>
            <button type="button" className="btn sec" onClick={onCerrar}>Cancelar</button>
          </div>
        </>
      )}
    </div>
  )
}

function FormVisita({ parcela, onListo }) {
  const [diag, setDiag] = useState(null)
  const [sev, setSev] = useState(null)
  const [tratamiento, setTratamiento] = useState('')
  const [nota, setNota] = useState('')
  const [estado, setEstado] = useState('')
  const [error, setError] = useState('')
  const entrada = useRef(null)

  async function foto(archivo) {
    setError(''); setEstado('Analizando la foto…'); setDiag(null)
    try {
      const r = await diagnosticar(await reducir(archivo), parcela.provincia)
      if (r.estado === 'rechazada') throw new Error(r.motivo || 'La foto no parece de una planta.')
      if (r.cultivo && r.cultivo !== parcela.cultivo) throw new Error(`La foto parece de ${CULTIVOS[r.cultivo]?.nombre ?? r.cultivo}, pero la parcela es de ${CULTIVOS[parcela.cultivo]?.nombre}.`)
      setDiag(r)
      if (r.estado === 'diagnostico' && esSana(r.clase)) setSev(0)
    } catch (e) { setError(e.message) } finally { setEstado('') }
  }

  async function guardar(e) {
    e.preventDefault(); setError('')
    if (sev == null) { setError('Elige la severidad que ves en la parcela.'); return }
    setEstado('Guardando…')
    try {
      await api.visita(parcela.id, { diagnostico_id: diag?.id ?? null, severidad: sev, tratamiento: tratamiento || null, nota: nota || null })
      setDiag(null); setSev(null); setTratamiento(''); setNota(''); onListo()
    } catch (x) { setError(x.message) } finally { setEstado('') }
  }

  return (
    <form className="tarjeta" onSubmit={guardar}>
      <header className="tarjeta-cab"><h3>Nueva visita</h3></header>
      <input ref={entrada} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files[0] && foto(e.target.files[0])} />
      <button type="button" className="btn sec ancho" onClick={() => entrada.current.click()}><Camera size={18} />{diag ? 'Cambiar foto' : 'Tomar foto (opcional)'}</button>
      {diag && <p className="pequeno" style={{ margin: '10px 0 0' }}>IA: <b>{diag.clase ? infoClase(diag.clase, diag.etiqueta).nombre : 'No concluyente'}</b>{diag.confianza != null && ` · ${pct(diag.confianza)}`}</p>}
      <fieldset className="campo severidad-opciones" style={{ marginTop: 14 }}>
        <span>¿Cuánto daño ves en la parcela?</span>
        {SEVERIDAD.map((s) => (
          <label key={s.valor} style={{ '--c': s.color }} aria-checked={sev === s.valor}>
            <input type="radio" name="sev" checked={sev === s.valor} onChange={() => setSev(s.valor)} />
            <i /><b>{s.nombre}</b><small className="tenue">{s.detalle}</small>
          </label>
        ))}
      </fieldset>
      <label className="campo"><span>Tratamiento aplicado hoy</span><div className="entrada"><input maxLength={300} value={tratamiento} onChange={(e) => setTratamiento(e.target.value)} placeholder="Ej.: fungicida cúprico" /></div></label>
      <label className="campo"><span>Nota</span><div className="entrada"><input maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" /></div></label>
      {error && <p className="alerta mal">{error}</p>}
      <button className="btn ancho" disabled={!!estado}>{estado ? <><span className="girando" />{estado}</> : 'Guardar visita'}</button>
    </form>
  )
}

function Severidad({ v, grande }) {
  const s = SEVERIDAD[v]
  return <span className={`severidad${grande ? ' grande' : ''}`} style={{ '--c': s.color }}><i />{s.nombre}</span>
}

function Tendencia({ t }) {
  const x = TENDENCIA[t]
  return <span className={`insignia ${x.clase}`}>{x.nombre}</span>
}

// Línea de severidad (0 a 3) en el tiempo. Eje X proporcional a la fecha; puntos con el color de su severidad.
function Linea({ visitas }) {
  const W = 640, H = 200, M = { i: 92, d: 16, s: 12, b: 28 }
  const t = visitas.map((v) => new Date(v.fecha).getTime())
  const t0 = Math.min(...t), t1 = Math.max(...t), rango = t1 - t0 || 1
  const x = (ms) => (visitas.length === 1 ? (M.i + W - M.d) / 2 : M.i + ((ms - t0) / rango) * (W - M.i - M.d))
  const y = (s) => M.s + ((3 - s) / 3) * (H - M.s - M.b)
  const pts = visitas.map((v, i) => [x(t[i]), y(v.severidad)])
  return (
    <svg className="linea-sev" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={visitas.map((v) => `${fecha(v.fecha)}: ${SEVERIDAD[v.severidad].nombre}`).join('; ')}>
      {SEVERIDAD.map((s) => (
        <g key={s.valor}>
          <line x1={M.i} x2={W - M.d} y1={y(s.valor)} y2={y(s.valor)} className="ls-guia" />
          <text x={M.i - 8} y={y(s.valor) + 4} className="ls-eje" textAnchor="end">{s.nombre}</text>
        </g>
      ))}
      {visitas.map((v, i) => v.tratamiento && (
        <g key={`t${v.id}`}><line x1={pts[i][0]} x2={pts[i][0]} y1={M.s} y2={H - M.b} className="ls-trat"><title>{`Tratamiento: ${v.tratamiento}`}</title></line></g>
      ))}
      <polyline points={pts.map((p) => p.join(',')).join(' ')} className="ls-trazo" />
      {visitas.map((v, i) => (
        <g key={v.id}>
          <circle cx={pts[i][0]} cy={pts[i][1]} r="6" fill={SEVERIDAD[v.severidad].color} className="ls-punto">
            <title>{`${fecha(v.fecha)} · ${SEVERIDAD[v.severidad].nombre}${v.tratamiento ? ` · Tratamiento: ${v.tratamiento}` : ''}`}</title>
          </circle>
          {(i === 0 || i === visitas.length - 1) && <text x={pts[i][0]} y={H - 8} className="ls-eje" textAnchor={i === 0 && visitas.length > 1 ? 'start' : 'end'}>{fecha(v.fecha)}</text>}
        </g>
      ))}
    </svg>
  )
}
