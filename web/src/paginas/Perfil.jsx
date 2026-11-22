import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail, Shield, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { actualizarPerfil, cambiarClave } from '../api/cliente'
import { useSesion } from '../contexto/Sesion'

export default function Perfil() {
  const s = useSesion()
  const usuario = s.usuario

  // Tarjeta 1: Datos
  const [nombre, setNombre] = useState(usuario?.nombre || '')
  const [guardandoDatos, setGuardandoDatos] = useState(false)
  const [exitoDatos, setExitoDatos] = useState('')
  const [errorDatos, setErrorDatos] = useState('')

  useEffect(() => {
    if (usuario?.nombre) setNombre(usuario.nombre)
  }, [usuario?.nombre])

  const guardarDatos = async (e) => {
    e.preventDefault()
    setExitoDatos('')
    setErrorDatos('')
    const limpio = nombre.trim()
    if (limpio.length < 2 || limpio.length > 120) {
      setErrorDatos('El nombre debe tener entre 2 y 120 caracteres.')
      return
    }
    setGuardandoDatos(true)
    try {
      const u = await actualizarPerfil(limpio)
      s.actualizarUsuario({ nombre: u.nombre })
      setExitoDatos('Nombre actualizado correctamente.')
    } catch (err) {
      setErrorDatos(err?.message || 'No se pudo actualizar el perfil.')
    } finally {
      setGuardandoDatos(false)
    }
  }

  // Tarjeta 2: Seguridad
  const tieneClave = usuario?.tiene_clave !== false
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [verActual, setVerActual] = useState(false)
  const [verNueva, setVerNueva] = useState(false)
  const [verConfirmar, setVerConfirmar] = useState(false)
  const [guardandoSeguridad, setGuardandoSeguridad] = useState(false)
  const [exitoSeguridad, setExitoSeguridad] = useState('')
  const [errorSeguridad, setErrorSeguridad] = useState('')

  const noCoinciden = confirmar.length > 0 && nueva !== confirmar
  const claveCorta = nueva.length > 0 && nueva.length < 8

  const guardarSeguridad = async (e) => {
    e.preventDefault()
    setExitoSeguridad('')
    setErrorSeguridad('')

    if (tieneClave && !actual) {
      setErrorSeguridad('Debes ingresar tu contraseña actual.')
      return
    }
    if (nueva.length < 8) {
      setErrorSeguridad('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva !== confirmar) {
      setErrorSeguridad('Las contraseñas no coinciden.')
      return
    }

    setGuardandoSeguridad(true)
    try {
      await cambiarClave(actual, nueva)
      setExitoSeguridad('Contraseña actualizada correctamente.')
      setActual('')
      setNueva('')
      setConfirmar('')
      if (!tieneClave) {
        s.actualizarUsuario({ tiene_clave: true })
      }
    } catch (err) {
      setErrorSeguridad(err?.message || 'No se pudo cambiar la contraseña.')
    } finally {
      setGuardandoSeguridad(false)
    }
  }

  return (
    <div className="rejilla-2">
      {/* Tarjeta 1: Datos */}
      <section className="tarjeta">
        <div className="tarjeta-cab">
          <div>
            <p className="sobre">Cuenta</p>
            <h3>Datos personales</h3>
          </div>
        </div>

        {exitoDatos && (
          <div className="alerta ok">
            <CheckCircle2 size={18} />
            <p>{exitoDatos}</p>
          </div>
        )}
        {errorDatos && (
          <div className="alerta mal">
            <AlertCircle size={18} />
            <p>{errorDatos}</p>
          </div>
        )}

        <form onSubmit={guardarDatos}>
          <label className="campo">
            <span>Correo electrónico</span>
            <div className="entrada">
              <Mail size={18} />
              <input
                type="email"
                value={usuario?.email || ''}
                readOnly
                disabled
                title="El correo no se puede modificar"
              />
            </div>
          </label>

          <label className="campo">
            <span>Nombre</span>
            <div className="entrada">
              <User size={18} />
              <input
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre completo"
              />
            </div>
          </label>

          <button
            type="submit"
            className="btn"
            disabled={guardandoDatos || !nombre.trim() || nombre.trim() === usuario?.nombre}
          >
            {guardandoDatos ? 'Guardando…' : 'Guardar datos'}
          </button>
        </form>
      </section>

      {/* Tarjeta 2: Seguridad */}
      <section className="tarjeta">
        <div className="tarjeta-cab">
          <div>
            <p className="sobre">Privacidad</p>
            <h3>Seguridad</h3>
          </div>
        </div>

        {exitoSeguridad && (
          <div className="alerta ok">
            <CheckCircle2 size={18} />
            <p>{exitoSeguridad}</p>
          </div>
        )}
        {errorSeguridad && (
          <div className="alerta mal">
            <AlertCircle size={18} />
            <p>{errorSeguridad}</p>
          </div>
        )}

        <form onSubmit={guardarSeguridad}>
          {tieneClave ? (
            <label className="campo">
              <span>Contraseña actual</span>
              <div className="entrada">
                <Lock size={18} />
                <input
                  type={verActual ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  placeholder="Tu contraseña actual"
                />
                <button
                  type="button"
                  className="ojo"
                  onClick={() => setVerActual(!verActual)}
                  aria-label={verActual ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'}
                >
                  {verActual ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
          ) : (
            <div className="alerta aviso" style={{ marginBottom: 14 }}>
              <Shield size={18} />
              <p>Tu cuenta se creó con Google. Asigna una contraseña si deseas ingresar directamente con correo y clave.</p>
            </div>
          )}

          <label className="campo">
            <span>Nueva contraseña</span>
            <div className="entrada">
              <Lock size={18} />
              <input
                type={verNueva ? 'text' : 'password'}
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                placeholder="Mínimo 8 caracteres"
              />
              <button
                type="button"
                className="ojo"
                onClick={() => setVerNueva(!verNueva)}
                aria-label={verNueva ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
              >
                {verNueva ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {claveCorta && (
            <p style={{ color: 'var(--aviso)', fontSize: '0.82rem', marginTop: -6, marginBottom: 10 }}>
              La contraseña debe tener al menos 8 caracteres.
            </p>
          )}

          <label className="campo">
            <span>Confirmar nueva contraseña</span>
            <div className="entrada">
              <Lock size={18} />
              <input
                type={verConfirmar ? 'text' : 'password'}
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repite la nueva contraseña"
              />
              <button
                type="button"
                className="ojo"
                onClick={() => setVerConfirmar(!verConfirmar)}
                aria-label={verConfirmar ? 'Ocultar confirmación' : 'Mostrar confirmación'}
              >
                {verConfirmar ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {noCoinciden && (
            <p style={{ color: 'var(--mal)', fontSize: '0.82rem', marginTop: -6, marginBottom: 10 }}>
              Las contraseñas no coinciden.
            </p>
          )}

          <button
            type="submit"
            className="btn"
            disabled={
              guardandoSeguridad ||
              !nueva ||
              nueva.length < 8 ||
              nueva !== confirmar ||
              (tieneClave && !actual)
            }
          >
            {guardandoSeguridad ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </form>
      </section>
    </div>
  )
}
