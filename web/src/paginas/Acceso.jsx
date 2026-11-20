import { ArrowRight, Eye, EyeOff, Fingerprint, Lock, LogIn, Mail, Moon, Radar, ScanSearch, ShieldCheck, Sun, User, UserPlus } from 'lucide-react'
import { useState } from 'react'
import Logo from '../componentes/Logo'
import { useSesion } from '../contexto/Sesion'
import { usarTema } from '../datos/tema'

// Fuerza de la contraseña: 0 a 4 (longitud, mayúsculas/minúsculas, números, símbolos).
const fuerza = (p) => [p.length >= 8, /[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^\w\s]/.test(p) || p.length >= 12].filter(Boolean).length
const TXT_FUERZA = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte']

export default function Acceso({ modo }) {
  const s = useSesion()
  const [tema, cambiarTema] = usarTema()
  const registro = modo === 'registro'
  const [f, setF] = useState({ nombre: '', email: '', password: '' })
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const cambiar = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const nivel = fuerza(f.password)

  async function enviar(e) {
    e.preventDefault()
    setError('')
    if (registro && nivel < 3) return setError('Usa al menos 8 caracteres con mayúsculas, minúsculas y números.')
    setEnviando(true)
    try {
      registro ? await s.registrar(f.nombre.trim(), f.email.trim(), f.password) : await s.entrar(f.email.trim(), f.password)
      location.hash = 'panel'
    } catch (err) {
      setError(err.estado === 403 && registro ? 'El registro está cerrado. Pide una cuenta al administrador.' : err.message)
    } finally { setEnviando(false) }
  }

  return (
    <div className="acceso">
      <section className="heroe">
        <div className="heroe-fondo" aria-hidden="true" />
        <Logo />
        <div className="heroe-cuerpo">
          <p className="sobre">EXPOFERIA FISI 2026 · San Martín</p>
          <h1>La IA que ve la <span className="degradado">enfermedad</span> antes que el ojo.</h1>
          <p className="heroe-texto">Una foto de la hoja o la mazorca y FitoLens reconoce el cultivo, identifica la enfermedad y marca dónde está.
            Pensado para el café, el cacao y las hortalizas de nuestra región.</p>

          <figure className="escaneo" aria-label="Ejemplo de análisis">
            <img src="/hoja-campo.jpg" alt="Hoja de papa con una lesión, fotografiada en campo" />
            <span className="escaneo-calor" />
            <span className="escaneo-linea" />
            <span className="escaneo-esquinas" />
            <figcaption className="escaneo-tarjeta">
              <small>Ejemplo · papa</small>
              <b>Tizón tardío</b>
              <span className="mini-barra"><i /></span>
              <small>Zona afectada marcada en rojo</small>
            </figcaption>
          </figure>

          <ul className="heroe-puntos">
            <li><ScanSearch size={18} />Rechaza fotos que no son de un cultivo soportado, en vez de inventar.</li>
            <li><Fingerprint size={18} />Cada modelo se verifica con su huella SHA-256 antes de usarse.</li>
            <li><Radar size={18} />Cada acceso queda auditado y un detector con ML vigila los ataques.</li>
          </ul>
        </div>
        <div className="heroe-cifras">
          <div><b>5</b><span>cultivos</span></div>
          <div><b>10</b><span>provincias en el mapa</span></div>
          <div><b>&lt; 1 s</b><span>por foto, sin GPU</span></div>
        </div>
      </section>

      <section className="acceso-lado">
        <button className="icono-btn tema-flotante" onClick={cambiarTema} aria-label="Cambiar tema">{tema === 'oscuro' ? <Sun size={18} /> : <Moon size={18} />}</button>
        <form className="acceso-form" onSubmit={enviar}>
          <div className="pestanas" role="tablist">
            <a href="#acceso" role="tab" aria-selected={!registro}>Iniciar sesión</a>
            <a href="#registro" role="tab" aria-selected={registro}>Crear cuenta</a>
          </div>
          <h2>{registro ? 'Crea tu cuenta' : 'Hola de nuevo'}</h2>
          <p className="tenue">{registro ? 'Guarda tu historial de diagnósticos y sigue tus parcelas.' : 'Ingresa para ver tu panel e historial.'}</p>

          {registro && (
            <label className="campo"><span>Nombre</span>
              <div className="entrada"><User size={18} /><input required minLength="2" maxLength="120" autoComplete="name" value={f.nombre} onChange={cambiar('nombre')} placeholder="Tu nombre" /></div>
            </label>
          )}
          <label className="campo"><span>Correo electrónico</span>
            <div className="entrada"><Mail size={18} /><input type="email" required autoComplete="email" value={f.email} onChange={cambiar('email')} placeholder="nombre@correo.com" /></div>
          </label>
          <label className="campo"><span>Contraseña</span>
            <div className="entrada"><Lock size={18} />
              <input type={ver ? 'text' : 'password'} required minLength={registro ? 8 : 1} autoComplete={registro ? 'new-password' : 'current-password'}
                value={f.password} onChange={cambiar('password')} placeholder={registro ? 'Mínimo 8 caracteres' : 'Tu contraseña'} />
              <button type="button" className="ojo" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{ver ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          {registro && f.password && (
            <div className={`fuerza n${nivel}`} aria-live="polite"><div>{[0, 1, 2, 3].map((i) => <i key={i} />)}</div><small>{TXT_FUERZA[nivel]}</small></div>
          )}
          {error && <p className="alerta mal" role="alert">{error}</p>}

          <button className="btn ancho grande" disabled={enviando}>
            {enviando ? <span className="girando" /> : registro ? <UserPlus size={19} /> : <LogIn size={19} />}
            {registro ? 'Crear cuenta' : 'Ingresar'}
          </button>
          <div className="separador"><span>o</span></div>
          <button type="button" className="btn sec ancho" onClick={() => { s.comoInvitado(); location.hash = 'diagnostico' }}>
            Probar sin cuenta<ArrowRight size={18} />
          </button>
          <p className="nota-seguridad"><ShieldCheck size={16} />Conexión cifrada. Cada acceso queda registrado y tras 5 intentos fallidos la cuenta se bloquea 15 minutos.</p>
        </form>
      </section>
    </div>
  )
}
