import { Eye, Image as ImagenIcono } from 'lucide-react'
import { useState } from 'react'

// Foto analizada con la "Visión de la IA": el mapa de calor (CAM) que devuelve la API en
// mapa_calor_png_base64, una capa PNG RGBA del mismo encuadre (rojo = lo que más pesó en la decisión;
// las zonas que la IA ignoró llegan azules o transparentes).
// Contorno de la hoja (segmentación de la API): contorno_hoja = lista de polígonos [[x, y], ...] normalizados 0–1
// (mismo encuadre que el mapa de calor). Se dibuja solo si mascara_ok es true. Acepta también un solo polígono.
function poligonos(c) {
  if (!Array.isArray(c) || !c.length) return []
  const punto = (p) => (Array.isArray(p) ? p : [p?.x, p?.y])
  const esPunto = (p) => typeof punto(p)[0] === 'number'
  const lista = esPunto(c[0]) ? [c] : c
  return lista.filter((pol) => Array.isArray(pol) && pol.length > 2).map((pol) => pol.map(punto))
}

export default function MapaCalor({ foto, calor, cargando, contorno, mascaraOk }) {
  const [tam, setTam] = useState(null)
  const polis = mascaraOk ? poligonos(contorno) : []
  const [vision, setVision] = useState(true)
  const [opacidad, setOpacidad] = useState(0.75)
  const mostrar = calor && vision
  return (
    <figure className="mapa-calor">
      {calor && (
        <div className="segmentado vision-toggle" role="group" aria-label="Vista de la foto">
          <button aria-pressed={!vision} onClick={() => setVision(false)}><ImagenIcono size={16} />Foto original</button>
          <button aria-pressed={vision} onClick={() => setVision(true)}><Eye size={16} />Visión de la IA</button>
        </div>
      )}
      <div className="marco">
        <img src={foto} alt="Foto analizada" onLoad={(e) => setTam([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />
        {calor && <img className="capa" src={`data:image/png;base64,${calor}`} alt="Mapa de calor: zonas que más pesaron en la decisión"
          style={{ opacity: mostrar ? opacidad : 0 }} />}
        {tam && polis.length > 0 && (
          <svg className="contorno-hoja" viewBox={`0 0 ${tam[0]} ${tam[1]}`} preserveAspectRatio="xMidYMid meet" aria-label="Contorno de la hoja detectada">
            {polis.map((pol, i) => <polygon key={i} points={pol.map(([x, y]) => `${x * tam[0]},${y * tam[1]}`).join(' ')} vectorEffect="non-scaling-stroke" />)}
          </svg>
        )}
        {cargando && <div className="escaner" aria-hidden="true" />}
      </div>
      {mostrar && (
        <figcaption className="vision-pie">
          <div className="vision-leyenda">
            <span>Lo ignoró</span><i aria-hidden="true" /><span>Lo que más miró</span>
          </div>
          <label className="vision-opacidad">
            <span>Intensidad</span>
            <input type="range" min="0.2" max="1" step="0.05" value={opacidad} aria-label="Intensidad del mapa de calor"
              onChange={(e) => setOpacidad(+e.target.value)} />
          </label>
          <small className="tenue">El color muestra qué zonas de la foto pesaron más en la decisión (Grad-CAM). Si el rojo cae fuera de la lesión, repite la foto.</small>
        </figcaption>
      )}
    </figure>
  )
}
