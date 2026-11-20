import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorPantalla from './componentes/ErrorPantalla'
import { SesionProvider } from './contexto/Sesion'
import { aplicarTema } from './datos/tema'
import './estilos.css'

aplicarTema()
createRoot(document.getElementById('root')).render(<StrictMode><ErrorPantalla><SesionProvider><App /></SesionProvider></ErrorPantalla></StrictMode>)
