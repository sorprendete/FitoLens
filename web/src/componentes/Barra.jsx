// Barra horizontal de porcentaje, accesible y sin librerías.
export default function Barra({ etiqueta, valor, tono = 'ok', marca }) {
  const pct = Math.round(valor * 100)
  return (
    <div className="barra" role="meter" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label={etiqueta}>
      <div className="barra-txt"><span>{etiqueta}</span><b>{pct} %</b></div>
      <div className="barra-pista">
        <div className={`barra-relleno ${tono}`} style={{ width: `${pct}%` }} />
        {marca != null && <i className="barra-marca" style={{ left: `${marca * 100}%` }} title={`Umbral ${Math.round(marca * 100)} %`} />}
      </div>
    </div>
  )
}
