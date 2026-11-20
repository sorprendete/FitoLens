import { Component } from 'react'

// Si una sección falla, muestra un aviso con opciones en vez de dejar la pantalla en blanco.
export default class ErrorPantalla extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[FitoLens]', error, info?.componentStack) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="tarjeta vacio" role="alert" style={{ margin: 24 }}>
        <h3>Algo salió mal en esta sección</h3>
        <p className="tenue">Puedes volver a intentarlo o ir al inicio. Si se repite, avisa al administrador.</p>
        <div className="acciones">
          <button className="btn" onClick={() => this.setState({ error: null })}>Reintentar</button>
          <a className="btn sec" href="#diagnostico" onClick={() => this.setState({ error: null })}>Ir al diagnóstico</a>
        </div>
      </div>
    )
  }
}
