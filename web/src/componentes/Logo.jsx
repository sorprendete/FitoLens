export default function Logo({ corto }) {
  return (
    <a href="#" className="logo" aria-label="FitoLens">
      <img src="/favicon.svg" alt="" width="36" height="36" />
      {!corto && <span><b>Fito<em>Lens</em></b><small>Diagnóstico de cultivos con IA</small></span>}
    </a>
  )
}
