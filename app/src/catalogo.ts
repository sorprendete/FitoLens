// Nombres y consejos por clase (copia de web/src/datos/clases.js). Dosis: siempre la etiqueta del producto registrado en SENASA.
export const CULTIVOS: Record<string, { nombre: string; color: string }> = {
  cafe: { nombre: 'Café', color: '#a78bfa' },
  cacao: { nombre: 'Cacao', color: '#fb923c' },
  papa: { nombre: 'Papa', color: '#fbbf24' },
  tomate: { nombre: 'Tomate', color: '#f472b6' },
  pimiento: { nombre: 'Pimiento', color: '#34d399' },
}

type Urgencia = 'ninguna' | 'media' | 'alta' | 'critica'
type Info = { nombre: string; agente: string; consejo: string; urgencia: Urgencia }
const I = (nombre: string, agente: string, consejo: string, urgencia: Urgencia = 'media'): Info => ({ nombre, agente, consejo, urgencia })
const SANA = I('Planta sana', 'Ninguno', 'Sigue con el monitoreo semanal y el manejo preventivo.', 'ninguna')

const CLASES: Record<string, Info> = {
  cafe_sana: SANA,
  cafe_roya: I('Roya amarilla', 'Hemileia vastatrix', 'Retira hojas muy afectadas, regula la sombra y aplica un fungicida cúprico o sistémico registrado. Avisa a tus vecinos: se dispersa con el viento.', 'alta'),
  cafe_ojo_de_gallo: I('Ojo de gallo', 'Mycena citricolor', 'Reduce la sombra y la humedad, poda para ventilar y aplica un fungicida cúprico registrado.'),
  cacao_sana: SANA,
  cacao_monilia: I('Moniliasis', 'Moniliophthora roreri', 'Cosecha y entierra o cubre las mazorcas enfermas cada semana, antes de que esporulen. No las dejes en el suelo.', 'critica'),
  cacao_mazorca_negra: I('Mazorca negra', 'Phytophthora palmivora', 'Retira mazorcas negras, mejora el drenaje y la poda, y protege las mazorcas jóvenes con un cúprico registrado.', 'alta'),
  papa_sana: SANA,
  papa_tizon_temprano: I('Tizón temprano', 'Alternaria solani', 'Elimina hojas bajas afectadas, rota cultivos y aplica un fungicida protector registrado.'),
  papa_tizon_tardio: I('Tizón tardío (rancha)', 'Phytophthora infestans', 'Actúa hoy: aplica un fungicida sistémico registrado y repite según la etiqueta. Avanza muy rápido con lluvia.', 'critica'),
  tomate_sana: SANA,
  tomate_mancha_bacteriana: I('Mancha bacteriana', 'Xanthomonas spp.', 'Evita mojar el follaje, retira hojas afectadas y usa productos cúpricos registrados.'),
  tomate_tizon_temprano: I('Tizón temprano', 'Alternaria solani', 'Retira hojas bajas afectadas, mejora la ventilación y aplica un fungicida protector registrado.'),
  tomate_tizon_tardio: I('Tizón tardío', 'Phytophthora infestans', 'Actúa hoy con un fungicida sistémico registrado; elimina plantas muy afectadas.', 'critica'),
  tomate_moho_hoja: I('Moho de la hoja', 'Passalora fulva', 'Baja la humedad, ventila y retira hojas afectadas.'),
  tomate_septoria: I('Mancha por Septoria', 'Septoria lycopersici', 'Retira hojas bajas, riega al pie y aplica un fungicida protector registrado.'),
  tomate_acaro: I('Ácaro de dos manchas', 'Tetranychus urticae', 'Revisa el envés, lava con agua a presión y usa un acaricida registrado si la plaga sigue.'),
  tomate_mancha_diana: I('Mancha diana', 'Corynespora cassiicola', 'Mejora la ventilación y aplica un fungicida registrado.'),
  tomate_virus_rizado: I('Virus del rizado amarillo', 'TYLCV (mosca blanca)', 'Arranca plantas enfermas y controla la mosca blanca. Un virus no se cura con fungicida.', 'alta'),
  tomate_virus_mosaico: I('Virus del mosaico', 'ToMV', 'Arranca plantas enfermas y desinfecta manos y herramientas. Un virus no se cura con fungicida.', 'alta'),
  pimiento_sana: SANA,
  pimiento_mancha_bacteriana: I('Mancha bacteriana', 'Xanthomonas spp.', 'Evita mojar el follaje, retira hojas afectadas y usa productos cúpricos registrados.'),
}

export const URGENCIA: Record<Urgencia, { texto: string; color: string }> = {
  ninguna: { texto: 'Sin tratamiento', color: '#34d399' },
  media: { texto: 'Actuar esta semana', color: '#fbbf24' },
  alta: { texto: 'Actuar en 1 o 2 días', color: '#fb7185' },
  critica: { texto: 'Actuar hoy', color: '#fb7185' },
}

const legible = (id = '') => id.replace(/^[a-z]+_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
export const esSana = (id = '') => id.endsWith('_sana')

export function infoClase(id: string, etiqueta?: string | null): Info {
  const base = CLASES[id] ?? I(etiqueta || legible(id), '—', 'Consulta a un agrónomo para confirmar.')
  return { ...base, nombre: etiqueta || base.nombre }
}
