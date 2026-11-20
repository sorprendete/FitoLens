// Nombres y consejos por clase. La API puede enviar su propia "etiqueta"; si no, se usa este catálogo.
// Ids: snake_case en español con prefijo de cultivo (mismo criterio que manifest.json de cada modelo).
// Las dosis se toman siempre de la etiqueta del producto registrado en SENASA.

export const CULTIVOS = {
  cafe: { nombre: 'Café', cientifico: 'Coffea arabica', color: '#c08552' },
  cacao: { nombre: 'Cacao', cientifico: 'Theobroma cacao', color: '#e07a5f' },
  papa: { nombre: 'Papa', cientifico: 'Solanum tuberosum', color: '#d4a373' },
  tomate: { nombre: 'Tomate', cientifico: 'Solanum lycopersicum', color: '#ef476f' },
  pimiento: { nombre: 'Pimiento', cientifico: 'Capsicum annuum', color: '#06d6a0' },
}

const C = (nombre, agente, consejo, urgencia = 'media') => ({ nombre, agente, consejo, urgencia })
const SANA = C('Planta sana', 'Ninguno', 'Sigue con el monitoreo semanal y el manejo preventivo.', 'ninguna')

export const CLASES = {
  cafe_sana: SANA,
  cafe_roya: C('Roya amarilla', 'Hemileia vastatrix', 'Retira hojas muy afectadas, regula la sombra y aplica un fungicida cúprico o sistémico registrado. Avisa a tus vecinos: se dispersa con el viento.', 'alta'),
  cafe_ojo_de_gallo: C('Ojo de gallo', 'Mycena citricolor', 'Reduce la sombra y la humedad, poda para ventilar y aplica un fungicida cúprico registrado.', 'media'),
  cacao_sana: SANA,
  cacao_monilia: C('Moniliasis', 'Moniliophthora roreri', 'Cosecha y entierra o cubre las mazorcas enfermas cada semana, antes de que esporulen. No las dejes en el suelo.', 'critica'),
  cacao_mazorca_negra: C('Mazorca negra', 'Phytophthora palmivora', 'Retira mazorcas negras, mejora el drenaje y la poda, y protege las mazorcas jóvenes con un cúprico registrado.', 'alta'),
  papa_sana: SANA,
  papa_tizon_temprano: C('Tizón temprano', 'Alternaria solani', 'Elimina hojas bajas afectadas, rota cultivos y aplica un fungicida protector registrado.'),
  papa_tizon_tardio: C('Tizón tardío (rancha)', 'Phytophthora infestans', 'Actúa hoy: aplica un fungicida sistémico registrado y repite según la etiqueta. Avanza muy rápido con lluvia.', 'critica'),
  tomate_sana: SANA,
  tomate_mancha_bacteriana: C('Mancha bacteriana', 'Xanthomonas spp.', 'Evita mojar el follaje, retira hojas afectadas y usa productos cúpricos registrados.'),
  tomate_tizon_temprano: C('Tizón temprano', 'Alternaria solani', 'Retira hojas bajas afectadas, mejora la ventilación y aplica un fungicida protector registrado.'),
  tomate_tizon_tardio: C('Tizón tardío', 'Phytophthora infestans', 'Actúa hoy con un fungicida sistémico registrado; elimina plantas muy afectadas.', 'critica'),
  tomate_moho_hoja: C('Moho de la hoja', 'Passalora fulva', 'Baja la humedad, ventila y retira hojas afectadas.'),
  tomate_septoria: C('Mancha por Septoria', 'Septoria lycopersici', 'Retira hojas bajas, riega al pie y aplica un fungicida protector registrado.'),
  tomate_acaro: C('Ácaro de dos manchas', 'Tetranychus urticae', 'Revisa el envés, lava con agua a presión y usa un acaricida registrado si la plaga sigue.'),
  tomate_mancha_diana: C('Mancha diana', 'Corynespora cassiicola', 'Mejora la ventilación y aplica un fungicida registrado.'),
  tomate_virus_rizado: C('Virus del rizado amarillo', 'TYLCV (mosca blanca)', 'Arranca plantas enfermas y controla la mosca blanca. Un virus no se cura con fungicida.', 'alta'),
  tomate_virus_mosaico: C('Virus del mosaico', 'ToMV', 'Arranca plantas enfermas y desinfecta manos y herramientas. Un virus no se cura con fungicida.', 'alta'),
  pimiento_sana: SANA,
  pimiento_mancha_bacteriana: C('Mancha bacteriana', 'Xanthomonas spp.', 'Evita mojar el follaje, retira hojas afectadas y usa productos cúpricos registrados.'),
}

export const URGENCIA = {
  ninguna: { texto: 'Sin tratamiento', tono: 'ok' },
  media: { texto: 'Actuar esta semana', tono: 'aviso' },
  alta: { texto: 'Actuar en 1 o 2 días', tono: 'mal' },
  critica: { texto: 'Actuar hoy', tono: 'mal' },
}

const legible = (id = '') => id.replace(/^[a-z]+_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

// Devuelve { nombre, agente, consejo, urgencia, cultivo } para cualquier id de clase.
export function infoClase(id, etiqueta) {
  const base = CLASES[id] ?? C(etiqueta || legible(id), '—', 'Consulta a un agrónomo para confirmar.')
  const cultivo = id?.split('_')[0]
  return { ...base, nombre: etiqueta || base.nombre, cultivo: CULTIVOS[cultivo] ? cultivo : null }
}

export const esSana = (id = '') => id.endsWith('_sana')
