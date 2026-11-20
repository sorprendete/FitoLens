import { useEffect, useState } from 'react'
import { esDemo, obtenerMetricas } from '../api/cliente'
import Barra from '../componentes/Barra'
import { CULTIVOS, infoClase } from '../datos/clases'

export default function Modelos() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { obtenerMetricas().then(setDatos).catch((e) => setError(e.message)) }, [])

  return (
    <section>
      <header className="encabezado">
        <div>
          <p className="sobretitulo">Transparencia</p>
          <h1>Qué tan bien funciona</h1>
          <p className="tenue">Medido con fotos <b>de campo</b> que el modelo nunca vio al entrenar, no con fotos de laboratorio.
            Así se mide de verdad cómo le irá al agricultor.</p>
        </div>
      </header>
      {error && <p className="aviso mal">{error}</p>}
      {datos && esDemo() && (
        <p className="aviso aviso"><b>Cifras de ejemplo.</b>&nbsp;No son mediciones: los valores reales aparecen aquí cuando la API carga los modelos entrenados.</p>
      )}
      <div className="modelos-grid">
        {datos?.modelos?.map((m) => <Ficha key={m.id} m={m} />)}
      </div>
    </section>
  )
}

function Ficha({ m }) {
  const cultivo = CULTIVOS[m.cultivo]
  const campo = m.campo ?? {}
  return (
    <article className="tarjeta ficha">
      <header>
        <h2>{m.id === 'hortalizas' ? 'Hortalizas' : cultivo?.nombre ?? m.id}</h2>
        <span className="tenue">{m.backbone} · v{m.version}</span>
      </header>
      <div className="cifra-grande"><b>{Math.round((campo.accuracy ?? 0) * 100)}<small>%</small></b><span>de acierto en campo</span></div>
      <Barra etiqueta="F1 macro (equilibrio entre clases)" valor={campo.f1_macro ?? 0} />
      {m.laboratorio?.accuracy != null && <Barra etiqueta="Acierto en laboratorio (referencia)" valor={m.laboratorio.accuracy} tono="tenue" />}
      <p className="tenue pequeno">{campo.n ?? '—'} fotos de prueba · umbral {Math.round((m.umbral ?? 0) * 100)} % · {m.latencia_ms ?? '—'} ms por foto en CPU</p>
      {campo.matriz_confusion && <Matriz clases={m.clases} matriz={campo.matriz_confusion} />}
    </article>
  )
}

function Matriz({ clases, matriz }) {
  const max = Math.max(1, ...matriz.flat())
  return (
    <details className="bloque">
      <summary>Matriz de confusión</summary>
      <p className="tenue pequeno">Filas: enfermedad real. Columnas: lo que dijo el modelo. La diagonal son los aciertos.</p>
      <div className="matriz" style={{ gridTemplateColumns: `minmax(6rem, auto) repeat(${clases.length}, 1fr)` }}>
        <span />
        {clases.map((c, j) => <span key={j} className="m-col" title={infoClase(c).nombre}>{j + 1}</span>)}
        {matriz.map((fila, i) => [
          <span key={`r${i}`} className="m-fila">{i + 1}. {infoClase(clases[i]).nombre}</span>,
          ...fila.map((v, j) => (
            <span key={`${i}-${j}`} className={`m-celda ${i === j ? 'diag' : ''}`} style={{ '--a': v / max }}>{v}</span>
          )),
        ])}
      </div>
    </details>
  )
}
