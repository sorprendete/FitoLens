// Historial local en SQLite. La foto se copia a la carpeta de la app para que no se pierda.
import * as SQLite from 'expo-sqlite'
import { File, Paths } from 'expo-file-system'
import type { Resultado } from './ia'
import { enLinea, enviar } from './servidor'

export type Fila = Resultado & { id: number; fecha: string; foto: string; sincronizado: number }

const db = SQLite.openDatabaseSync('fitolens.db')
db.execSync(`CREATE TABLE IF NOT EXISTS diagnosticos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, foto TEXT NOT NULL, datos TEXT NOT NULL, sincronizado INTEGER NOT NULL DEFAULT 0)`)

export function guardar(uri: string, r: Resultado) {
  const destino = new File(Paths.document, `foto_${Date.now()}.jpg`)
  new File(uri).copy(destino)
  db.runSync('INSERT INTO diagnosticos (fecha, foto, datos, sincronizado) VALUES (?, ?, ?, ?)',
    new Date().toISOString(), destino.uri, JSON.stringify(r), r.origen === 'servidor' ? 1 : 0)
  return destino.uri
}

export function listar(): Fila[] {
  return db.getAllSync<{ id: number; fecha: string; foto: string; datos: string; sincronizado: number }>(
    'SELECT * FROM diagnosticos ORDER BY id DESC LIMIT 200').map(({ datos, ...f }) => ({ ...JSON.parse(datos), ...f }))
}

export const pendientes = () => db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM diagnosticos WHERE sincronizado = 0')?.n ?? 0

export function borrar(id: number) {
  const f = db.getFirstSync<{ foto: string }>('SELECT foto FROM diagnosticos WHERE id = ?', id)
  try { if (f) new File(f.foto).delete() } catch { /* ya no existe */ }
  db.runSync('DELETE FROM diagnosticos WHERE id = ?', id)
}

// Sube las fotos diagnosticadas sin internet. Devuelve cuántas se enviaron.
export async function sincronizar(): Promise<number> {
  if (!(await enLinea())) throw new Error('Sin conexión a internet.')
  const filas = db.getAllSync<{ id: number; foto: string }>('SELECT id, foto FROM diagnosticos WHERE sincronizado = 0')
  let n = 0
  for (const f of filas) {
    await enviar(f.foto)
    db.runSync('UPDATE diagnosticos SET sincronizado = 1 WHERE id = ?', f.id)
    n++
  }
  return n
}
