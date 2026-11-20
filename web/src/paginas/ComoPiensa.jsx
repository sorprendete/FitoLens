import { Camera, Flame, Gauge, ScanSearch, Sprout } from 'lucide-react'
import { useState } from 'react'

const ETAPAS = [
  { icono: Camera, titulo: 'La foto', texto: 'Llega la imagen de una hoja o mazorca, tomada en el campo, con su luz y su fondo reales.' },
  { icono: Sprout, titulo: '1. ¿Qué cultivo es?', texto: 'Un primer modelo reconoce si es café, cacao, papa, tomate o pimiento. Si es otra cosa, rechaza la foto en vez de inventar.' },
  { icono: ScanSearch, titulo: '2. El especialista', texto: 'Cada cultivo tiene su propio modelo, entrenado solo con sus enfermedades. Así cada uno se mejora sin romper los demás.' },
  { icono: Gauge, titulo: '3. Confianza honesta', texto: 'La confianza se calibra: cuando dice 80 %, acierta cerca de 8 de cada 10 veces. Por debajo del umbral responde "no concluyente".' },
  { icono: Flame, titulo: '4. Muestra dónde miró', texto: 'El mapa de calor marca la zona de la hoja que más pesó en la decisión, para que el agricultor y el agrónomo la verifiquen.' },
]

// 12 casos de ejemplo (confianza, ¿acertó?) para ver el efecto del umbral. Ilustrativos.
const CASOS = [[.97, 1], [.94, 1], [.91, 1], [.88, 1], [.84, 1], [.79, 0], [.73, 1], [.66, 0], [.61, 1], [.55, 0], [.48, 0], [.41, 0]]

export default function ComoPiensa() {
  const [umbral, setUmbral] = useState(0.6)
  const pasan = CASOS.filter(([c]) => c >= umbral)
  const aciertos = pasan.filter(([, a]) => a).length
  return (
    <section>
      <header className="encabezado">
        <div>
          <p className="sobretitulo">Explicable, no una caja negra</p>
          <h2 className="titular">Cómo piensa la IA</h2>
          <p className="tenue">FitoLens no es un solo modelo: es una cadena de decisiones, y cada una se puede revisar.</p>
        </div>
      </header>

      <ol className="flujo">
        {ETAPAS.map(({ icono: Icono, titulo, texto }, i) => (
          <li key={titulo} className="tarjeta" style={{ animationDelay: `${i * 100}ms` }}>
            <span className="flujo-icono"><Icono /></span>
            <h3>{titulo}</h3>
            <p>{texto}</p>
          </li>
        ))}
      </ol>

      <div className="explica-grid">
        <div className="tarjeta">
          <h2>Pruébalo: el umbral de confianza</h2>
          <p className="tenue">Cada punto es un diagnóstico. Mueve el umbral: los que quedan por debajo pasan a "no concluyente" y se pide otra foto.</p>
          <div className="casos">
            {CASOS.map(([c, a], i) => (
              <span key={i} className={`caso ${c < umbral ? 'fuera' : a ? 'bien' : 'falla'}`} title={`${Math.round(c * 100)} %`}>
                {Math.round(c * 100)}
              </span>
            ))}
          </div>
          <label className="deslizador">
            <span>Umbral: <b>{Math.round(umbral * 100)} %</b></span>
            <input type="range" min="0.4" max="0.95" step="0.01" value={umbral} onChange={(e) => setUmbral(+e.target.value)} />
          </label>
          <div className="resumen-umbral">
            <div><b>{pasan.length}</b><span>responde</span></div>
            <div><b>{pasan.length ? Math.round(aciertos / pasan.length * 100) : 0} %</b><span>acierta de esas</span></div>
            <div><b>{CASOS.length - pasan.length}</b><span>pide otra foto</span></div>
          </div>
          <p className="tenue pequeno">Ejemplo ilustrativo. El umbral real de cada cultivo se fija con fotos de campo de validación.</p>
        </div>

        <div className="tarjeta">
          <h2>Por qué fotos de campo</h2>
          <p>Un modelo entrenado solo con fotos de laboratorio (hoja sola, fondo liso) puede pasar del 96 % en el laboratorio a cerca del 50 % en una chacra.</p>
          <p>Por eso FitoLens se entrena mezclando ambos tipos y <b>se evalúa solo con fotos de campo</b>, con aumentos que imitan el campo: sombra, desenfoque, fondos con otras plantas y tierra.</p>
          <h2>El mapa de calor</h2>
          <p>Se calcula con los pesos de la última capa del modelo (CAM). No es un adorno: si la zona roja cae fuera de la lesión, es señal de que hay que repetir la foto.</p>
        </div>
      </div>
    </section>
  )
}
