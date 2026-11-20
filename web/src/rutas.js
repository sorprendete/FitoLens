import { Activity, BarChart3, Brain, FileClock, Grid3x3, LayoutDashboard, Map, Radar, ScanLine, Users } from 'lucide-react'
import Amenazas from './paginas/admin/Amenazas'
import Auditoria from './paginas/admin/Auditoria'
import Riesgos from './paginas/admin/Riesgos'
import Usuarios from './paginas/admin/Usuarios'
import Brotes from './paginas/Brotes'
import ComoPiensa from './paginas/ComoPiensa'
import Diagnostico from './paginas/Diagnostico'
import Historial from './paginas/Historial'
import Modelos from './paginas/Modelos'
import Panel from './paginas/Panel'

// Todas las secciones en un solo lugar. acceso: 'publico' (también invitados) | 'cuenta' | 'admin'.
// Para agregar una sección: crear la página y añadir una línea aquí.
export const RUTAS = [
  { id: 'panel', titulo: 'Panel', icono: LayoutDashboard, C: Panel, acceso: 'cuenta', grupo: 'Principal' },
  { id: 'diagnostico', titulo: 'Diagnóstico', icono: ScanLine, C: Diagnostico, acceso: 'publico', grupo: 'Principal' },
  { id: 'historial', titulo: 'Historial', icono: FileClock, C: Historial, acceso: 'cuenta', grupo: 'Principal' },
  { id: 'brotes', titulo: 'Mapa de brotes', icono: Map, C: Brotes, acceso: 'publico', grupo: 'Región San Martín' },
  { id: 'como-piensa', titulo: 'Cómo piensa la IA', icono: Brain, C: ComoPiensa, acceso: 'publico', grupo: 'Inteligencia artificial' },
  { id: 'modelos', titulo: 'Precisión en campo', icono: BarChart3, C: Modelos, acceso: 'publico', grupo: 'Inteligencia artificial' },
  { id: 'usuarios', titulo: 'Usuarios', icono: Users, C: Usuarios, acceso: 'admin', grupo: 'Administración' },
  { id: 'auditoria', titulo: 'Auditoría', icono: Activity, C: Auditoria, acceso: 'admin', grupo: 'Administración' },
  { id: 'amenazas', titulo: 'Detector de amenazas', icono: Radar, C: Amenazas, acceso: 'admin', grupo: 'Seguridad' },
  { id: 'riesgos', titulo: 'Matriz de riesgos', icono: Grid3x3, C: Riesgos, acceso: 'admin', grupo: 'Seguridad' },
]

export const puedeVer = (r, s) => r.acceso === 'publico' || (r.acceso === 'cuenta' && !!s.usuario) || (r.acceso === 'admin' && s.esAdmin)
