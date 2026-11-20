import { useState } from 'react'

// Foto con el mapa de calor encima. El PNG de la API trae solo la capa de color (con transparencia).
export default function MapaCalor({ foto, calor, cargando }) {
  const [opacidad, setOpacidad] = useState(0.7)
  return (
    <figure className="mapa-calor">
      <div className="marco">
        <img src={foto} alt="Foto analizada" />
        {calor && <img className="capa" src={`data:image/png;base64,${calor}`} alt="" style={{ opacity: opacidad }} />}
        {cargando && <div className="escaner" aria-hidden="true" />}
      </div>
      {calor && (
        <figcaption>
          <span>Foto</span>
          <input type="range" min="0" max="1" step="0.05" value={opacidad} aria-label="Intensidad del mapa de calor"
            onChange={(e) => setOpacidad(+e.target.value)} />
          <span>Zona que miró la IA</span>
        </figcaption>
      )}
    </figure>
  )
}
