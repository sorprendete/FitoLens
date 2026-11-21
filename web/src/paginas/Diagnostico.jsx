import { AlertTriangle, Bug, Camera, Check, ChevronDown, CircleCheck, CircleHelp, Focus, Hand, Cpu, ImageUp, LocateFixed, MapPin, RotateCcw, ShieldAlert, Sun } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { diagnosticar, versionModelos } from '../api/cliente'
import Barra from '../componentes/Barra'
import BotonReporte from '../componentes/BotonReporte'
import Camara from '../componentes/Camara'
import MapaCalor from '../componentes/MapaCalor'
import Pasos from '../componentes/Pasos'
import Voz from '../componentes/Voz'
import { CLASES, CULTIVOS, URGENCIA, esSana, infoClase } from '../datos/clases'
import { PROVINCIAS } from '../datos/provincias'
import { provinciaDe, reducir } from '../datos/utiles'

const CLAVE_PROV = 'fitolens.provincia'
const leerProv = () => { try { return localStorage.getItem(CLAVE_PROV) || '' } catch { return '' } }

export default function Diagnostico() {
  const [camara, setCamara] = useState(false)
  const [foto, setFoto] = useState(null)
  const [res, setRes] = useState(null)
  const [enviada, setEnviada] = useState(null) // foto exacta enviada a la API (la pide el reporte PDF)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [provincia, setProvincia] = useState(leerProv)
  const [gps, setGps] = useState('')
  const entrada = useRef(null)
  const tarjeta = useRef(null)
  // En el celular el resultado queda debajo de la foto: se lleva a la vista al empezar y al terminar.
  useEffect(() => { if ((cargando || res) && innerWidth < 900) tarjeta.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [cargando, res])
  const [version, setVersion] = useState('')
  useEffect(() => { versionModelos().then(setVersion).catch(() => {}) }, [])

  useEffect(() => { try { localStorage.setItem(CLAVE_PROV, provincia) } catch { /* sin almacenamiento */ } }, [provincia])
  useEffect(() => () => foto && URL.revokeObjectURL(foto), [foto])

  const analizar = useCallback(async (archivo) => {
    setCamara(false); setRes(null); setError('')
    setFoto(URL.createObjectURL(archivo)); setCargando(true)
    try { const f = await reducir(archivo); setEnviada(f); setRes(await diagnosticar(f, provincia)) }
    catch (e) { setError(e.message || 'No se pudo analizar la foto.') }
    finally { setCargando(false) }
  }, [provincia])

  function ubicar() {
    setGps('Buscando…')
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => {
        const p = provinciaDe(coords.latitude, coords.longitude)
        if (p) { setProvincia(p); setGps('') } else setGps('Estás fuera de San Martín')
      },
      () => setGps('Sin permiso de ubicación'), { timeout: 8000 })
  }

  const reiniciar = () => { setFoto(null); setRes(null); setError('') }

  return (
    <section className="diag">
      {camara && <Camara onCaptura={analizar} onCerrar={() => setCamara(false)} />}
      <input ref={entrada} type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && analizar(e.target.files[0])} />

      {!foto ? (
        <div className="portada">
          <div className="portada-txt">
            <p className="sobretitulo">Café · Cacao · Maíz · Limón · Naranja · Papa · Tomate · Pimiento</p>
            <h2 className="titular">Una foto.<br /><span className="degradado">Un diagnóstico en un segundo.</span></h2>
            <p className="tenue grande-txt">FitoLens reconoce el cultivo, detecta la enfermedad y te muestra en qué parte de la hoja la vio.
              Si no está segura, te lo dice.</p>
            <div className="acciones">
              <button className="btn grande brillo" onClick={() => setCamara(true)}><Camera />Tomar foto</button>
              <button className="btn grande sec" onClick={() => entrada.current.click()}><ImageUp />Subir foto</button>
            </div>
            <QueDetecta />
            <div className="tarjeta ubicacion-tarjeta">
              <label htmlFor="prov" className="ubicacion-label">
                <MapPin size={17} />
                <span>¿Dónde está tu cultivo?</span>
              </label>
              <div className="ubicacion-fila">
                <select id="prov" className="ubicacion-select" value={provincia} onChange={(e) => setProvincia(e.target.value)}>
                  <option value="">Prefiero no decirlo</option>
                  {PROVINCIAS.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <button type="button" className="btn sec ubicacion-btn" onClick={ubicar}>
                  <LocateFixed size={18} />
                  <span>Usar mi ubicación</span>
                </button>
              </div>
              {gps && <p className="ubicacion-gps">{gps}</p>}
              <p className="tenue pequeno ubicacion-ayuda">La provincia alimenta el mapa de brotes de la región. No se envía tu ubicación exacta.</p>
            </div>
            {version && <p className="version-modelo"><Cpu size={14} />Modelos activos: {version}</p>}
          </div>
          <aside className="tarjeta guia">
            <h3>Para un buen diagnóstico</h3>
            <ul>
              <li><Sun size={20} /><div><b>Buena luz, sin sol directo</b><small>La sombra de un árbol o un día nublado es ideal.</small></div></li>
              <li><Focus size={20} /><div><b>Una sola hoja o mazorca</b><small>Que ocupe casi todo el recuadro, enfocada.</small></div></li>
              <li><Bug size={20} /><div><b>Que se vea el síntoma</b><small>Manchas, polvo, pudrición: acerca la cámara a la lesión.</small></div></li>
              <li><Hand size={20} /><div><b>Fondo simple</b><small>Si puedes, pon tu mano o un cuaderno detrás.</small></div></li>
            </ul>
          </aside>
        </div>
      ) : (
        <div className="diag-grid">
          <div>
            <MapaCalor foto={foto} calor={res?.mapa_calor_png_base64} contorno={res?.contorno_hoja} mascaraOk={res?.mascara_ok === true} cargando={cargando} />
            <div className="acciones">
              <button className="btn" onClick={() => setCamara(true)}><Camera />Otra foto</button>
              <button className="btn sec" onClick={() => entrada.current.click()}><ImageUp />Subir</button>
              <button className="btn sec" onClick={reiniciar}><RotateCcw />Inicio</button>
            </div>
          </div>
          <div className="tarjeta resultado" aria-live="polite" ref={tarjeta}>
            {cargando && <Cargando />}
            {error && <Aviso icono={AlertTriangle} tono="mal" titulo="No se pudo analizar" texto={error} />}
            {res && <Resultado r={res} onOtra={() => setCamara(true)} version={version} archivo={enviada} />}
          </div>
        </div>
      )}
    </section>
  )
}

const ORDEN_CULTIVOS = ['cafe', 'cacao', 'papa', 'tomate', 'pimiento', 'maiz', 'limon', 'naranja']

function QueDetecta() {
  return (
    <details className="tarjeta que-detecta">
      <summary className="que-detecta-resumen">
        <span>Qué detecta FitoLens</span>
        <ChevronDown size={18} className="que-detecta-chevron" />
      </summary>
      <div className="que-detecta-contenido">
        <p className="tenue pequeno que-detecta-intro">
          FitoLens identifica 28 enfermedades y el estado sano en 8 cultivos:
        </p>
        <div className="que-detecta-grid">
          {ORDEN_CULTIVOS.map((id) => {
            const cult = CULTIVOS[id]
            if (!cult) return null
            const clasesCultivo = Object.entries(CLASES).filter(([k]) => k.startsWith(id + '_'))
            return (
              <div key={id} className="que-detecta-grupo" style={{ '--color-cultivo': cult.color }}>
                <div className="que-detecta-grupo-cab">
                  <span className="que-detecta-punto" />
                  <h4>{cult.nombre}</h4>
                  {cult.cientifico && <small className="tenue">{cult.cientifico}</small>}
                </div>
                <ul className="que-detecta-items">
                  {clasesCultivo.map(([k, c]) => {
                    const sana = esSana(k)
                    return (
                      <li key={k} className={sana ? 'es-sana' : ''}>
                        {sana ? <Check size={14} /> : <span className="icono-enfermedad">•</span>}
                        <span>{c.nombre}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </details>
  )
}

// Pasos que se iluminan uno tras otro mientras la API responde (suele tardar menos de 1 s).
const PASOS_ESPERA = ['Recibiendo la foto', 'Reconociendo el cultivo', 'Buscando síntomas con el especialista', 'Calibrando la confianza', 'Marcando la zona afectada']

function Cargando() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((x) => Math.min(x + 1, PASOS_ESPERA.length - 1)), 650)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="cargando" role="status">
      <div className="pulso" />
      <p className="cargando-titulo">Analizando…</p>
      <ol className="espera">
        {PASOS_ESPERA.map((p, i) => (
          <li key={p} className={i < n ? 'hecho' : i === n ? 'activo' : ''}>
            <span className="espera-icono">{i < n ? <Check size={14} /> : <span className="girando chico" />}</span>{p}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Aviso({ icono: Icono, tono, titulo, texto }) {
  return (
    <div className={`alerta ${tono}`}>
      <Icono size={28} />
      <div><h2>{titulo}</h2><p>{texto}</p></div>
    </div>
  )
}

// Consejos con dibujo para repetir la foto (no concluyente o rechazada).
function ConsejosFoto() {
  return (
    <div className="consejos-foto">
      <p className="consejos-titulo">Para que la IA lo vea mejor:</p>
      <div className="consejos-grid">
        <figure><Dibujo tipo="cerca" /><figcaption><b>Acércate</b>La hoja debe llenar casi toda la foto.</figcaption></figure>
        <figure><Dibujo tipo="luz" /><figcaption><b>Buena luz</b>De día, en sombra suave. Sin sol directo ni flash.</figcaption></figure>
        <figure><Dibujo tipo="una" /><figcaption><b>Una sola hoja</b>O una sola mazorca, centrada y enfocada.</figcaption></figure>
      </div>
    </div>
  )
}

// Ilustraciones simples: a la izquierda cómo NO, a la derecha cómo SÍ.
function Dibujo({ tipo }) {
  const hoja = (x, y, s, c = '#34d399') => <path d={`M${x} ${y + 14 * s}c0-9 ${6 * s}-${14 * s} ${15 * s}-${14 * s}c0 9-${6 * s} ${14 * s}-${15 * s} ${14 * s}z`} fill={c} />
  const mal = tipo === 'cerca' ? hoja(14, 14, 0.55) : tipo === 'luz' ? <>{hoja(8, 6, 1.1, '#1f5f46')}<rect x="2" y="2" width="36" height="36" rx="5" fill="#0008" /></> : <>{hoja(4, 6, 0.7)}{hoja(18, 4, 0.7)}{hoja(10, 20, 0.7)}{hoja(22, 18, 0.7)}</>
  const bien = tipo === 'luz' ? <>{hoja(8, 6, 1.1)}<circle cx="33" cy="7" r="4" fill="#fbbf24" /></> : hoja(6, 4, 1.25)
  return (
    <svg viewBox="0 0 96 40" className="dibujo" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="5" className="marco-mal" />{mal}
      <path d="M8 34l24-28" stroke="#f87171" strokeWidth="2.5" />
      <path d="M44 20h8m-3-3l3 3-3 3" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <g transform="translate(56 0)"><rect x="2" y="2" width="36" height="36" rx="5" className="marco-bien" />{bien}</g>
    </svg>
  )
}

function Resultado({ r, onOtra, version, archivo }) {
  const otra = <button className="btn enorme ancho" onClick={onOtra}><Camera size={26} />Tomar otra foto</button>
  if (r.estado === 'rechazada') return (
    <>
      <Aviso icono={ShieldAlert} tono="aviso" titulo="Esta foto no es de un cultivo soportado"
        texto={r.motivo || 'Toma la foto de una hoja de café, maíz, limón, naranja, papa, tomate o pimiento, o de una mazorca de cacao.'} />
      <Voz r={r} />
      <ConsejosFoto />
      {otra}
      <details className="bloque"><summary>Cómo lo decidió la IA</summary><Pasos pasos={r.pasos} /></details>
    </>
  )
  const info = infoClase(r.clase, r.etiqueta)
  const cultivo = CULTIVOS[r.cultivo]
  const dudosa = r.estado === 'no_concluyente'
  const umbral = r.pasos?.find((p) => p.id === 'calibracion')?.umbral
  const urg = URGENCIA[info.urgencia]
  const sana = esSana(r.clase)
  return (
    <>
      {cultivo && <p className="chip-cultivo" style={{ '--c': cultivo.color }}>{cultivo.nombre} <i>{cultivo.cientifico}</i></p>}
      {dudosa ? (
        <>
          <Aviso icono={CircleHelp} tono="aviso" titulo="No concluyente"
            texto={r.motivo || 'La IA no está lo bastante segura para darte un diagnóstico. Repite la foto así:'} />
          <ConsejosFoto />
        </>
      ) : (
        <div className={`veredicto ${sana ? 'es-sana' : 'es-enferma'}`}>
          {sana ? <CircleCheck size={52} /> : <AlertTriangle size={52} />}
          <div>
            <h2>{info.nombre}</h2>
            {info.agente !== 'Ninguno' && <p className="cientifico">{info.agente}</p>}
          </div>
          <div className="veredicto-conf"><b>{Math.round(r.confianza * 100)}%</b><span>seguro</span></div>
        </div>
      )}
      {!dudosa && urg && <p className={`urgencia ${urg.tono}`}>{urg.texto}</p>}
      {!dudosa && <p className="consejo grande">{info.consejo}</p>}
      <Voz r={r} info={info} sana={sana} />
      {otra}
      <BotonReporte r={r} archivo={archivo} />

      <Barra etiqueta={dudosa ? `Más probable: ${info.nombre}` : 'Confianza calibrada'} valor={r.confianza}
        tono={dudosa ? 'aviso' : 'ok'} marca={umbral} />
      {r.top3?.length > 1 && (
        <details className="bloque">
          <summary>Otras posibilidades</summary>
          {r.top3.slice(1).map((t) => <Barra key={t.clase} etiqueta={infoClase(t.clase, t.etiqueta).nombre} valor={t.confianza} tono="tenue" />)}
        </details>
      )}
      <details className="bloque">
        <summary>Cómo lo decidió la IA</summary>
        <Pasos pasos={r.pasos} />
      </details>
      <p className="tenue pequeno">Orientación de apoyo, no reemplaza la visita de un agrónomo. Modelo {r.modelo_version}{version ? ` · ${version}` : ''}.</p>
    </>
  )
}
