// Parcelas guardadas en el teléfono (SQLite): funciona sin internet y sin cuenta.
// Misma idea que la web: cada visita guarda severidad (0 a 3), tratamiento y, si hubo foto, el diagnóstico.
import * as SQLite from 'expo-sqlite'
import type { Resultado } from './ia'
import { esSana } from './catalogo'

export type Parcela = { id: number; nombre: string; cultivo: string; lugar: string | null; creado: string; servidor_id?: number | null }
export type Visita = { id: number; parcela_id: number; fecha: string; severidad: number; tratamiento: string | null
  nota: string | null; clase: string | null; confianza: number | null; foto: string | null; diagnostico_id?: number | null }
export type Tendencia = 'mejora' | 'empeora' | 'igual' | 'sin_datos'

// Verde solo para "sin síntomas"; de naranja a rojo oscuro, cuanto más daño (igual que la web).
export const SEVERIDAD = [
  { nombre: 'Sin síntomas', detalle: 'Ninguna hoja o fruto afectado', color: '#34d399' },
  { nombre: 'Leve', detalle: 'Menos del 10 %', color: '#fb923c' },
  { nombre: 'Moderada', detalle: 'Entre 10 y 30 %', color: '#ef4444' },
  { nombre: 'Grave', detalle: 'Más del 30 %', color: '#b91c1c' },
]
export const TENDENCIA: Record<Tendencia, string> = { mejora: 'Mejorando', empeora: 'Empeorando', igual: 'Sin cambios', sin_datos: 'Faltan visitas' }

const db = SQLite.openDatabaseSync('fitolens.db')
db.execSync(`
  CREATE TABLE IF NOT EXISTS parcelas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, cultivo TEXT NOT NULL, lugar TEXT, creado TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS visitas (id INTEGER PRIMARY KEY AUTOINCREMENT, parcela_id INTEGER NOT NULL, fecha TEXT NOT NULL, severidad INTEGER NOT NULL,
    tratamiento TEXT, nota TEXT, clase TEXT, confianza REAL, foto TEXT);`)

try {
  const colVisitas = db.getAllSync<{ name: string }>('PRAGMA table_info(visitas)').map((c) => c.name)
  if (!colVisitas.includes('diagnostico_id')) {
    db.execSync('ALTER TABLE visitas ADD COLUMN diagnostico_id INTEGER')
  }
} catch {}

try {
  const colParcelas = db.getAllSync<{ name: string }>('PRAGMA table_info(parcelas)').map((c) => c.name)
  if (!colParcelas.includes('servidor_id')) {
    db.execSync('ALTER TABLE parcelas ADD COLUMN servidor_id INTEGER')
  }
} catch {}

export const listarParcelas = () => db.getAllSync<Parcela>('SELECT * FROM parcelas ORDER BY id DESC')

export function crearParcela(nombre: string, cultivo: string, lugar: string) {
  db.runSync('INSERT INTO parcelas (nombre, cultivo, lugar, creado) VALUES (?, ?, ?, ?)', nombre.trim(), cultivo, lugar.trim() || null, new Date().toISOString())
}

export function borrarParcela(id: number) {
  try {
    db.runSync('UPDATE diagnosticos SET parcela_id = NULL WHERE parcela_id = ?', id)
  } catch {}
  try {
    db.runSync('DELETE FROM visitas WHERE parcela_id = ?', id)
    db.runSync('DELETE FROM parcelas WHERE id = ?', id)
  } catch {}
}

export const visitas = (parcela: number) =>
  db.getAllSync<Visita>('SELECT * FROM visitas WHERE parcela_id = ? ORDER BY fecha, id', parcela)

export function agregarVisita(parcela: number, severidad: number, tratamiento: string, nota: string, r?: Resultado | null, foto?: string | null, diagnostico_id?: number | null) {
  db.runSync('INSERT INTO visitas (parcela_id, fecha, severidad, tratamiento, nota, clase, confianza, foto, diagnostico_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    parcela, new Date().toISOString(), severidad, tratamiento.trim() || null, nota.trim() || null, r?.clase ?? null, r?.confianza ?? null, foto ?? null, diagnostico_id ?? null)
}

export function agregarDiagnosticoAParcela(
  parcelaId: number,
  diagnosticoId: number,
  r?: Resultado | null,
  foto?: string | null,
  severidad?: number,
  nota?: string
) {
  try {
    const existe = db.getFirstSync<{ id: number }>(
      'SELECT id FROM visitas WHERE parcela_id = ? AND diagnostico_id = ?',
      parcelaId,
      diagnosticoId
    )
    if (existe) return
    const sev = severidad ?? (r?.clase && esSana(r.clase) ? 0 : 2)
    db.runSync(
      'INSERT INTO visitas (parcela_id, fecha, severidad, tratamiento, nota, clase, confianza, foto, diagnostico_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      parcelaId,
      new Date().toISOString(),
      sev,
      null,
      nota?.trim() || null,
      r?.clase ?? null,
      r?.confianza ?? null,
      foto ?? null,
      diagnosticoId
    )
  } catch {}
}

export function quitarDiagnosticoDeParcela(parcelaId: number, diagnosticoId: number) {
  try {
    db.runSync(
      'DELETE FROM visitas WHERE parcela_id = ? AND diagnostico_id = ?',
      parcelaId,
      diagnosticoId
    )
  } catch {}
}

export const borrarVisita = (id: number) => db.runSync('DELETE FROM visitas WHERE id = ?', id)

// Última visita comparada con la del primer tratamiento (o con la primera visita). Igual que la API.
export function tendencia(v: Visita[]): Tendencia {
  if (v.length < 2) return 'sin_datos'
  const base = v.find((x) => x.tratamiento) ?? v[0]
  if (base === v[v.length - 1]) return 'sin_datos'
  const d = v[v.length - 1].severidad - base.severidad
  return d < 0 ? 'mejora' : d > 0 ? 'empeora' : 'igual'
}
