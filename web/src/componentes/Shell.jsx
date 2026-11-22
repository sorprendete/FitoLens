import { LogIn, LogOut, Menu, Moon, ShieldCheck, Sun, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { alCambiarDemo, esDemo } from '../api/cliente'
import { useSesion } from '../contexto/Sesion'
import { usarTema } from '../datos/tema'
import { RUTAS, puedeVer } from '../rutas'
import Logo from './Logo'

export default function Shell({ ruta, children }) {
  const s = useSesion()
  const [tema, cambiarTema] = usarTema()
  const [abierto, setAbierto] = useState(false)
  const [demo, setDemo] = useState(esDemo)
  useEffect(() => alCambiarDemo(setDemo), [])
  useEffect(() => setAbierto(false), [ruta.id])

  const visibles = RUTAS.filter((r) => puedeVer(r, s))
  const grupos = [...new Set(visibles.map((r) => r.grupo))]
  const movil = visibles.filter((r) => ['panel', 'diagnostico', 'historial', 'brotes', 'modelos'].includes(r.id)).slice(0, 4)
  const inicial = (s.usuario?.nombre || '?').trim()[0]?.toUpperCase()

  return (
    <div className="app">
      <aside className={`lateral ${abierto ? 'abierto' : ''}`}>
        <div className="lateral-cab">
          <Logo />
          <button className="icono-btn solo-movil" onClick={() => setAbierto(false)} aria-label="Cerrar menú"><X /></button>
        </div>
        <nav aria-label="Secciones">
          {grupos.map((g) => (
            <div key={g} className="grupo">
              <p className="grupo-titulo">{g}</p>
              {visibles.filter((r) => r.grupo === g).map(({ id, titulo, icono: I }) => (
                <a key={id} href={`#${id}`} className="nav-item" aria-current={ruta.id === id ? 'page' : undefined}><I size={19} />{titulo}</a>
              ))}
            </div>
          ))}
        </nav>
        <div className="lateral-pie">
          <div className="sello"><ShieldCheck size={16} /><span>Modelos verificados con SHA-256 · HTTPS · sesión JWT</span></div>
          {s.usuario ? (
            <div className="usuario">
              <a href="#perfil" className="avatar" title="Mi perfil" style={{ textDecoration: 'none' }}>{inicial}</a>
              <div><b><a href="#perfil" style={{ textDecoration: 'none', color: 'inherit' }} title="Mi perfil">{s.usuario.nombre}</a></b><small>{s.esAdmin ? 'Administrador' : s.usuario.email}</small></div>
              <button className="icono-btn" onClick={s.salir} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={18} /></button>
            </div>
          ) : (
            <a className="btn sec ancho" href="#acceso"><LogIn size={18} />Iniciar sesión</a>
          )}
        </div>
      </aside>
      {abierto && <div className="velo" onClick={() => setAbierto(false)} />}

      <div className="contenido">
        <header className="superior">
          <button className="icono-btn solo-movil" onClick={() => setAbierto(true)} aria-label="Abrir menú"><Menu /></button>
          <span className="solo-movil"><Logo corto /></span>
          <h1 className="titulo-pagina">{ruta.titulo}</h1>
          <div className="superior-der">
            {demo && <span className="chip-demo" title="La API no respondió: los datos son de ejemplo, no reales.">Modo demostración</span>}
            <button className="icono-btn" onClick={cambiarTema} aria-label="Cambiar tema" title={tema === 'oscuro' ? 'Tema claro' : 'Tema oscuro'}>
              {tema === 'oscuro' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main key={ruta.id} className="pagina">{children}</main>
        <footer className="pie">FitoLens · EXPOFERIA FISI 2026 · Universidad Nacional de San Martín, Tarapoto · <a href="/privacidad/">Política de privacidad</a></footer>
      </div>

      <nav className="nav-movil" aria-label="Accesos rápidos">
        {movil.map(({ id, titulo, icono: I }) => (
          <a key={id} href={`#${id}`} aria-current={ruta.id === id ? 'page' : undefined}><I size={20} /><span>{titulo.split(' ')[0]}</span></a>
        ))}
        <button onClick={() => setAbierto(true)}><Menu size={20} /><span>Más</span></button>
      </nav>
    </div>
  )
}
