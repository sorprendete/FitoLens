// Textos para leer el resultado en voz alta, en castellano sencillo o en quechua.
// No hay voces de quechua en navegadores ni teléfonos: el quechua se lee con la voz en castellano,
// que lo pronuncia de forma aceptable porque usa casi las mismas letras.
// Las frases en quechua son un BORRADOR corto: revisarlas con un hablante de la zona antes de la feria.
// Mismo contenido que web/src/datos/voz.js.

export type Idioma = 'es' | 'qu'
export const IDIOMAS: Record<Idioma, string> = { es: 'Castellano', qu: 'Quechua' }

const QU = {
  sana: 'Sachaykiqa allinmi kachkan.',
  enferma: (n: string) => `Sachaykiqa unqusqam kachkan. Unquyninqa: ${n}.`,
  urgencia: <Record<string, string>>{ critica: 'Kunan punchawmi ruwanayki.', alta: 'Iskay punchawpi ruway.', media: 'Kay semanapi ruway.', ninguna: 'Sapa semana qhawallay.' },
  dudosa: 'Manam sut\'itachu rikuni. Yapamanta fotota hurquy, asuykuspa, achikyaypi.',
  rechazada: 'Kay fotoqa manam sachapa raphinchu. Yapamanta hurquy.',
  cierre: 'Agronomowan rimay.',
}

const URG_ES: Record<string, string> = { critica: 'Actúa hoy mismo.', alta: 'Actúa en uno o dos días.', media: 'Actúa esta semana.', ninguna: 'No necesita tratamiento.' }

// r: respuesta del diagnóstico; info: infoClase(r.clase, r.etiqueta); sana: esSana(r.clase)
type R = { estado: string; confianza?: number | null }
type I = { nombre: string; consejo: string; urgencia: string }

export function textoVoz(r: R, info?: I, sana = false, idioma: Idioma = 'es'): string {
  if (r.estado === 'diagnostico' && !info) return ''
  if (idioma === 'qu') {
    if (r.estado === 'rechazada') return QU.rechazada
    if (r.estado === 'no_concluyente') return QU.dudosa
    return [sana ? QU.sana : QU.enferma(info!.nombre), QU.urgencia[info!.urgencia] || '', QU.cierre].join(' ')
  }
  if (r.estado === 'rechazada') return 'Esta foto no es de una hoja de un cultivo que conozco. Toma otra foto de cerca, a una sola hoja.'
  if (r.estado === 'no_concluyente') return 'No estoy segura del resultado. Toma otra foto de cerca, con buena luz y a una sola hoja.'
  const pct = Math.round((r.confianza || 0) * 100)
  return [sana ? 'Tu planta está sana.' : `Tu planta tiene ${info!.nombre}.`, `Estoy ${pct} por ciento segura.`,
    URG_ES[info!.urgencia] || '', sana ? info!.consejo : `Qué hacer: ${info!.consejo}`,
    sana ? '' : 'La dosis está en la etiqueta del producto. Si tienes dudas, consulta a un agrónomo.'].join(' ')
}
