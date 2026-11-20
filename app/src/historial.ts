// Historial local en SQLite. También es la cola de envío: cada fila con sincronizado = 0 espera internet.
// La foto se copia a la carpeta de la app para que no se pierda.
import { AppState } from 'react-native'
import * as SQLite from 'expo-sqlite'
import * as Network from 'expo-network'
import { File, Paths } from 'expo-file-system'
import type { Resultado } from './ia'
import { ErrorServidor, enLinea, enviar, subir } from './servidor'
import { alCambiar, cuentaActual, olvidarSesion, provinciaActual } from './cuenta'

// sincronizado: 0 pendiente | 1 subido | 2 el servidor no lo aceptó (ver error)
export type Fila = Resultado & { id: number; fecha: string; foto: string; sincronizado: number; provincia: string | null; error: string | null }
type FilaDb = { id: number; fecha: string; foto: string; datos: string; sincronizado: number; id_cliente: string; provincia: string | null; error: string | null }

const db = SQLite.openDatabaseSync('fitolens.db')
db.execSync(`CREATE TABLE IF NOT EXISTS diagnosticos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, foto TEXT NOT NULL, datos TEXT NOT NULL, sincronizado INTEGER NOT NULL DEFAULT 0)`)
// Columnas nuevas para teléfonos que ya tenían la app instalada (no se borra nada).
const columnas = db.getAllSync<{ name: string }>('PRAGMA table_info(diagnosticos)').map((c) => c.name)
for (const [c, tipo] of [['id_cliente', 'TEXT'], ['provincia', 'TEXT'], ['servidor_id', 'INTEGER'], ['error', 'TEXT']])
  if (!columnas.includes(c)) db.execSync(`ALTER TABLE diagnosticos ADD COLUMN ${c} ${tipo}`)
db.execSync(`UPDATE diagnosticos SET id_cliente = lower(hex(randomblob(16))) WHERE id_cliente IS NULL`)

export function guardar(uri: string, r: Resultado) {
  const destino = new File(Paths.document, `foto_${Date.now()}.jpg`)
  new File(uri).copy(destino)
  db.runSync(`INSERT INTO diagnosticos (fecha, foto, datos, sincronizado, id_cliente, provincia)
    VALUES (?, ?, ?, ?, lower(hex(randomblob(16))), ?)`,
    new Date().toISOString(), destino.uri, JSON.stringify(r), r.origen === 'servidor' ? 1 : 0, provinciaActual())
  intentar()
  return destino.uri
}

export function listar(): Fila[] {
  return db.getAllSync<FilaDb>('SELECT * FROM diagnosticos ORDER BY id DESC LIMIT 200')
    .map(({ datos, id_cliente, ...f }) => ({ ...JSON.parse(datos), ...f }))
}

export const pendientes = () => db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM diagnosticos WHERE sincronizado = 0')?.n ?? 0

export function borrar(id: number) {
  const f = db.getFirstSync<{ foto: string }>('SELECT foto FROM diagnosticos WHERE id = ?', id)
  try { if (f) new File(f.foto).delete() } catch { /* ya no existe */ }
  db.runSync('DELETE FROM diagnosticos WHERE id = ?', id)
}

// Sube la cola. Con cuenta: /api/sincronizar (queda en el historial de la web, con la fecha real y sin duplicar).
// Sin cuenta: /api/diagnostico anónimo (solo suma al mapa de brotes). Devuelve cuántos se enviaron.
let enCurso: Promise<number> | null = null
export function sincronizar(): Promise<number> {
  return (enCurso ??= enviarCola().finally(() => { enCurso = null }))
}

async function enviarCola(): Promise<number> {
  if (!(await enLinea())) throw new Error('Sin conexión a internet.')
  const conCuenta = !!cuentaActual()
  const filas = db.getAllSync<FilaDb>('SELECT * FROM diagnosticos WHERE sincronizado = 0 ORDER BY id')
  let n = 0
  for (const f of filas) {
    try {
      if (conCuenta) {
        const id = await subir({ id_cliente: f.id_cliente, foto: f.foto, fecha: f.fecha, provincia: f.provincia, r: JSON.parse(f.datos) })
        db.runSync('UPDATE diagnosticos SET sincronizado = 1, servidor_id = ?, error = NULL WHERE id = ?', id, f.id)
      } else {
        await enviar(f.foto, f.provincia)
        db.runSync('UPDATE diagnosticos SET sincronizado = 1, error = NULL WHERE id = ?', f.id)
      }
      n++
    } catch (e) {
      if (e instanceof ErrorServidor && e.codigo === 401 && conCuenta) {
        await olvidarSesion()
        throw new Error('Tu sesión venció o desvinculaste este teléfono desde la web. Vuelve a iniciar sesión: tus diagnósticos siguen guardados aquí.')
      }
      // El servidor no acepta esta fila (foto dañada, de otra cuenta…): se aparta para no trabar la cola.
      if (e instanceof ErrorServidor && e.codigo >= 400 && e.codigo < 500 && ![408, 429].includes(e.codigo)) {
        db.runSync('UPDATE diagnosticos SET sincronizado = 2, error = ? WHERE id = ?', e.message, f.id)
        continue
      }
      throw e // sin red o servidor caído: se reintenta después
    }
  }
  return n
}

// Envío automático, solo con cuenta: al abrir la app, al volver la señal, al iniciar sesión y tras cada diagnóstico.
const oyentes = new Set<(n: number) => void>()
function intentar() {
  if (!cuentaActual() || pendientes() === 0) return
  sincronizar().then((n) => { if (n) oyentes.forEach((f) => f(n)) }).catch(() => { /* se reintenta luego */ })
}

export function sincronizarSola(alEnviar?: (n: number) => void) {
  if (alEnviar) oyentes.add(alEnviar)
  const red = Network.addNetworkStateListener((e) => { if (e.isConnected && e.isInternetReachable !== false) intentar() })
  const app = AppState.addEventListener('change', (s) => { if (s === 'active') intentar() })
  const quitar = alCambiar(intentar)
  intentar()
  return () => { if (alEnviar) oyentes.delete(alEnviar); red.remove(); app.remove(); quitar() }
}
