import { AlertTriangle, Ban, CheckCircle2, Leaf, Lock, ScanLine, ShieldAlert, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { admin } from '../../api/cliente'
import { Dona, Kpi } from '../../componentes/Graficos'
import { useSesion } from '../../contexto/Sesion'
import { ESTADO } from '../../datos/paleta'

const fecha = (f) => (f ? new Date(f).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nunca')

export default function Usuarios() {
  const { usuario } = useSesion()
  const [r, setR] = useState(null)
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(null)
  useEffect(() => {
    admin.resumen().then(setR).catch((e) => setError(e.message))
    admin.usuarios().then(setLista).catch((e) => setError(e.message))
  }, [])

  async function alternar(u) {
    if (!confirmar(u)) return
    setOcupado(u.id); setError('')
    try { const x = await admin.cambiarEstado(u.id, !u.activo); setLista((l) => l.map((y) => (y.id === u.id ? { ...y, activo: x.activo } : y))) }
    catch (e) { setError(e.message) } finally { setOcupado(null) }
  }

  return (
    <div className="apilado">
      {error && <p className="alerta mal">{error}</p>}
      <div className="rejilla-kpi">
        <Kpi icono={Users} titulo="Usuarios" valor={r?.usuarios ?? '…'} />
        <Kpi icono={ScanLine} titulo="Diagnósticos" valor={r?.analisis ?? '…'} sub={r && `${r.rechazadas} fotos rechazadas`} />
        <Kpi icono={Lock} titulo="Logins fallidos (24 h)" valor={r?.logins_fallidos_24h ?? '…'} tono="aviso" />
        <Kpi icono={ShieldAlert} titulo="Bloqueos (24 h)" valor={r?.bloqueos_24h ?? '…'} tono="mal" />
      </div>
      {r && (
        <section className="tarjeta">
          <header className="tarjeta-cab"><h3>Resultados de todos los diagnósticos</h3></header>
          <Dona centro={r.analisis} sub="en total" datos={[
            { etiqueta: 'Sanas', valor: r.sanos, color: ESTADO.sana.color }, { etiqueta: 'Con enfermedad', valor: r.enfermos, color: ESTADO.enferma.color },
            { etiqueta: 'No concluyentes', valor: r.no_concluyentes, color: ESTADO.no_concluyente.color }, { etiqueta: 'Rechazadas', valor: r.rechazadas ?? 0, color: ESTADO.rechazada.color }]} />
        </section>
      )}
      <section className="tarjeta sin-relleno">
        <header className="tarjeta-cab relleno"><h3>Cuentas</h3><span className="tenue">{lista?.length ?? 0} registradas</span></header>
        <table className="tabla">
          <thead><tr><th>Usuario</th><th>Rol</th><th>Diagnósticos</th><th>Último acceso</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {lista?.map((u) => (
              <tr key={u.id} className={u.activo ? '' : 'apagada'}>
                <td data-l="Usuario" className="principal"><span className="avatar chico">{u.nombre[0]}</span><span><b>{u.nombre}</b><small className="tenue bloque-txt">{u.email}</small></span></td>
                <td data-l="Rol"><span className={`insignia ${u.rol === 'admin' ? 'acento' : 'neutro'}`}>{u.rol === 'admin' ? 'Administrador' : 'Usuario'}</span></td>
                <td data-l="Diagnósticos">{u.diagnosticos ?? 0}</td>
                <td data-l="Último acceso">{fecha(u.ultimo_acceso)}</td>
                <td data-l="Estado">{u.activo ? <span className="insignia ok"><CheckCircle2 size={14} />Activa</span> : <span className="insignia mal"><Ban size={14} />Desactivada</span>}</td>
                <td>{u.id !== usuario?.id && (
                  <button className={`btn chico ${u.activo ? 'peligro' : 'sec'}`} disabled={ocupado === u.id} onClick={() => alternar(u)}>
                    {u.activo ? 'Desactivar' : 'Activar'}
                  </button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="tenue pequeno"><AlertTriangle size={14} /> Desactivar una cuenta cierra su sesión al instante. La acción queda en la auditoría.</p>
    </div>
  )
}

// eslint-disable-next-line no-alert
const confirmar = (u) => !u.activo || window.confirm(`¿Desactivar la cuenta de ${u.nombre}? Su sesión se cerrará al instante.`)
