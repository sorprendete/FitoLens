import { FileDown } from 'lucide-react'
import { useState } from 'react'
import { API_URL } from '../config'

// Descarga el reporte PDF del diagnóstico. La API pide la misma foto que se diagnosticó
// (compara su huella), por eso se reenvía el archivo que se subió.
export default function BotonReporte({ r, archivo }) {
  const [estado, setEstado] = useState('')
  if (r.estado !== 'diagnostico' || !archivo || !r.id) return null

  async function descargar() {
    setEstado('Generando…')
    try {
      const cuerpo = new FormData()
      cuerpo.append('imagen', archivo, 'foto.jpg')
      const resp = await fetch(`${API_URL}/reporte/${r.id}`, { method: 'POST', body: cuerpo })
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || 'El reporte solo está disponible con el servidor activo.')
      const url = URL.createObjectURL(await resp.blob())
      const a = Object.assign(document.createElement('a'), { href: url, download: `fitolens-reporte-${r.id}.pdf` })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      setEstado('')
    } catch (e) {
      setEstado(e instanceof TypeError ? 'No se pudo conectar con el servidor.' : e.message)
    }
  }

  return (
    <>
      <button className="btn sec ancho" onClick={descargar} disabled={estado === 'Generando…'}>
        <FileDown />{estado === 'Generando…' ? estado : 'Descargar reporte PDF'}
      </button>
      {estado && estado !== 'Generando…' && <p className="tenue pequeno">{estado}</p>}
    </>
  )
}
