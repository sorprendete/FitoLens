import { AlertTriangle, Bug, Camera, CircleCheck, CircleHelp, Focus, Hand, ImageUp, LocateFixed, MapPin, RotateCcw, ShieldAlert, Sun } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { diagnosticar } from '../api/cliente'
import Barra from '../componentes/Barra'
import Camara from '../componentes/Camara'
import MapaCalor from '../componentes/MapaCalor'
import Pasos from '../componentes/Pasos'
import { CULTIVOS, URGENCIA, esSana, infoClase } from '../datos/clases'
import { PROVINCIAS } from '../datos/provincias'
import { provinciaDe, reducir } from '../datos/utiles'

const CLAVE_PROV = 'fitolens.provincia'
const leerProv = () => { try { return localStorage.getItem(CLAVE_PROV) || '' } catch { return '' } }

export default function Diagnostico() {
  const [camara, setCamara] = useState(false)
  const [foto, setFoto] = useState(null)
  const [res, setRes] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [provincia, setProvincia] = useState(leerProv)
  const [gps, setGps] = useState('')
  const entrada = useRef(null)

  useEffect(() => { try { localStorage.setItem(CLAVE_PROV, provincia) } catch { /* sin almacenamiento */ } }, [provincia])
  useEffect(() => () => foto && URL.revokeObjectURL(foto), [foto])

  const analizar = useCallback(async (archivo) => {
    setCamara(false); setRes(null); setError('')
    setFoto(URL.createObjectURL(archivo)); setCargando(true)
    try { setRes(await diagnosticar(await reducir(archivo), provincia)) }
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
            <p className="sobretitulo">Café · Cacao · Papa · Tomate · Pimiento</p>
            <h2 className="titular">Una foto.<br /><span className="degradado">Un diagnóstico en un segundo.</span></h2>
            <p className="tenue grande-txt">FitoLens reconoce el cultivo, detecta la enfermedad y te muestra en qué parte de la hoja la vio.
              Si no está segura, te lo dice.</p>
            <div className="acciones">
              <button className="btn grande brillo" onClick={() => setCamara(true)}><Camera />Tomar foto</button>
              <button className="btn grande sec" onClick={() => entrada.current.click()}><ImageUp />Subir foto</button>
            </div>
            <div className="ubicacion">
              <label htmlFor="prov"><MapPin size={17} />¿Dónde está tu cultivo?</label>
              <select id="prov" value={provincia} onChange={(e) => setProvincia(e.target.value)}>
                <option value="">Prefiero no decirlo</option>
                {PROVINCIAS.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <button className="icono-btn" onClick={ubicar} title="Usar mi ubicación" aria-label="Usar mi ubicación"><LocateFixed size={18} /></button>
              {gps && <small className="tenue">{gps}</small>}
            </div>
            <p className="tenue pequeno">La provincia alimenta el mapa de brotes de la región. No se envía tu ubicación exacta.</p>
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
            <MapaCalor foto={foto} calor={res?.mapa_calor_png_base64} cargando={cargando} />
            <div className="acciones">
              <button className="btn" onClick={() => setCamara(true)}><Camera />Otra foto</button>
              <button className="btn sec" onClick={() => entrada.current.click()}><ImageUp />Subir</button>
              <button className="btn sec" onClick={reiniciar}><RotateCcw />Inicio</button>
            </div>
          </div>
          <div className="tarjeta resultado" aria-live="polite">
            {cargando && <Cargando />}
            {error && <Aviso icono={AlertTriangle} tono="mal" titulo="No se pudo analizar" texto={error} />}
            {res && <Resultado r={res} />}
          </div>
        </div>
      )}
    </section>
  )
}

function Cargando() {
  return (
    <div className="cargando">
      <div className="pulso" />
      <p>Analizando la foto…</p>
      <small className="tenue">Reconociendo el cultivo y buscando síntomas</small>
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

function Resultado({ r }) {
  if (r.estado === 'rechazada') return (
    <>
      <Aviso icono={ShieldAlert} tono="aviso" titulo="Esta foto no es de un cultivo soportado"
        texto={r.motivo || 'Toma la foto de una hoja de café, papa, tomate o pimiento, o de una mazorca de cacao.'} />
      <Pasos pasos={r.pasos} />
    </>
  )
  const info = infoClase(r.clase, r.etiqueta)
  const cultivo = CULTIVOS[r.cultivo]
  const dudosa = r.estado === 'no_concluyente'
  const umbral = r.pasos?.find((p) => p.id === 'calibracion')?.umbral
  const urg = URGENCIA[info.urgencia]
  return (
    <>
      {cultivo && <p className="chip-cultivo" style={{ '--c': cultivo.color }}>{cultivo.nombre} <i>{cultivo.cientifico}</i></p>}
      {dudosa ? (
        <Aviso icono={CircleHelp} tono="aviso" titulo="No concluyente"
          texto={r.motivo || 'La IA no está lo bastante segura. Toma otra foto más cerca, con buena luz y una sola hoja.'} />
      ) : (
        <div className="veredicto">
          {esSana(r.clase) ? <CircleCheck className="ok-txt" size={36} /> : <AlertTriangle className="mal-txt" size={36} />}
          <div>
            <h2>{info.nombre}</h2>
            {info.agente !== 'Ninguno' && <p className="cientifico">{info.agente}</p>}
          </div>
          {urg && <span className={`etiqueta ${urg.tono}`}>{urg.texto}</span>}
        </div>
      )}

      <Barra etiqueta={dudosa ? `Más probable: ${info.nombre}` : 'Confianza calibrada'} valor={r.confianza}
        tono={dudosa ? 'aviso' : 'ok'} marca={umbral} />

      {!dudosa && <p className="consejo">{info.consejo}</p>}

      {r.top3?.length > 1 && (
        <details className="bloque" open>
          <summary>Otras posibilidades</summary>
          {r.top3.slice(1).map((t) => <Barra key={t.clase} etiqueta={infoClase(t.clase, t.etiqueta).nombre} valor={t.confianza} tono="tenue" />)}
        </details>
      )}
      <details className="bloque" open>
        <summary>Cómo lo decidió la IA</summary>
        <Pasos pasos={r.pasos} />
      </details>
      <p className="tenue pequeno">Orientación de apoyo, no reemplaza la visita de un agrónomo. Modelo {r.modelo_version}.</p>
    </>
  )
}
