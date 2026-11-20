// Modelos que viajan dentro de la app, en el formato de entrenamiento/movil/cuantizar.py:
// assets/modelos/<nombre>.onnx + modelos.json. Para cambiarlos, vuelve a correr ese script y recompila.
const INFO: { modelos: any[] } = require('../assets/modelos/modelos.json')

const ARCHIVOS = {
  router: require('../assets/modelos/router.onnx'),
  hortalizas: require('../assets/modelos/hortalizas.onnx'),
  cafe: require('../assets/modelos/cafe.onnx'),
  cacao: require('../assets/modelos/cacao.onnx'),
  maiz: require('../assets/modelos/maiz.onnx'),
  citricos: require('../assets/modelos/citricos.onnx'),
}
export type NombreModelo = keyof typeof ARCHIVOS
export const archivo = (n: NombreModelo) => ARCHIVOS[n]
// Un modelo que no figura en modelos.json no se usa (aunque quede un .onnx viejo en la carpeta).
export const manifest = (n: string) => INFO.modelos.find((m) => m.nombre === n) ?? null
