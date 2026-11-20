// Nombres y consejos por clase (copia de web/src/datos/clases.js). Dosis: siempre la etiqueta del producto registrado en SENASA.
export const CULTIVOS: Record<string, { nombre: string; color: string }> = {
  cafe: { nombre: 'Café', color: '#a78bfa' },
  cacao: { nombre: 'Cacao', color: '#fb923c' },
  papa: { nombre: 'Papa', color: '#fbbf24' },
  tomate: { nombre: 'Tomate', color: '#f472b6' },
  pimiento: { nombre: 'Pimiento', color: '#34d399' },
  maiz: { nombre: 'Maíz', color: '#e879f9' },
  limon: { nombre: 'Limón', color: '#a3e635' },
  naranja: { nombre: 'Naranja', color: '#fb7185' },
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
  tomate_septoriosis: I('Mancha por Septoria', 'Septoria lycopersici', 'Retira hojas bajas, riega al pie y aplica un fungicida protector registrado.'),
  tomate_arana_roja: I('Ácaro de dos manchas', 'Tetranychus urticae', 'Revisa el envés, lava con agua a presión y usa un acaricida registrado si la plaga sigue.'),
  tomate_mancha_diana: I('Mancha diana', 'Corynespora cassiicola', 'Mejora la ventilación y aplica un fungicida registrado.'),
  tomate_virus_rizado_amarillo: I('Virus del rizado amarillo', 'TYLCV (mosca blanca)', 'Arranca plantas enfermas y controla la mosca blanca. Un virus no se cura con fungicida.', 'alta'),
  tomate_virus_mosaico: I('Virus del mosaico', 'ToMV', 'Arranca plantas enfermas y desinfecta manos y herramientas. Un virus no se cura con fungicida.', 'alta'),
  pimiento_sana: SANA,
  pimiento_mancha_bacteriana: I('Mancha bacteriana', 'Xanthomonas spp.', 'Evita mojar el follaje, retira hojas afectadas y usa productos cúpricos registrados.'),
  maiz_sana: SANA,
  maiz_tizon_hoja: I('Tizón de la hoja', 'Exserohilum turcicum', 'Siembra variedades o híbridos tolerantes, rota con otro cultivo y no dejes rastrojo enfermo en la chacra. Si avanza antes de la floración y llueve seguido, aplica un fungicida registrado.'),
  maiz_roya_comun: I('Roya común', 'Puccinia sorghi', 'Usa variedades resistentes en la próxima siembra. Si las pústulas suben a las hojas de arriba antes de la floración, aplica un fungicida registrado.'),
  maiz_mancha_gris: I('Mancha gris', 'Cercospora zeae-maydis', 'Rota con otro cultivo, entierra o retira el rastrojo enfermo y siembra híbridos tolerantes. Si sube a la hoja de la mazorca con clima húmedo, aplica un fungicida registrado.'),
  maiz_gusano_cogollero: I('Gusano cogollero', 'Spodoptera frugiperda', 'Revisa el cogollo de las plantas jóvenes dos veces por semana. Si hay larvas vivas en varias plantas, aplica un insecticida registrado o uno biológico (Bacillus thuringiensis) dirigido al cogollo, al atardecer.', 'alta'),
  limon_sana: SANA,
  limon_cancrosis: I('Cancrosis', 'Xanthomonas citri subsp. citri', 'Poda y quema las ramas con lesiones, desinfecta las tijeras y protege los brotes nuevos y frutos pequeños con un cúprico registrado. Controla el minador: sus heridas facilitan la infección.', 'alta'),
  limon_hlb: I('HLB (enverdecimiento o greening)', 'Candidatus Liberibacter spp. (lo transmite el psílido Diaphorina citri)', 'No tiene cura. Confírmalo con un análisis de laboratorio y avisa a SENASA: es una plaga bajo vigilancia oficial. Controla el psílido y no saques plantas ni varetas de esta huerta.', 'critica'),
  limon_mancha_negra: I('Mancha negra', 'Phyllosticta citricarpa', 'Recoge y entierra las hojas y frutos caídos, y protege los frutos desde la caída de pétalos con un fungicida registrado. Pide a SENASA o a un agrónomo que la confirme: afecta la venta de fruta.', 'alta'),
  limon_melanosis: I('Melanosis', 'Diaporthe citri', 'Poda y saca de la huerta las ramas secas, que es donde vive el hongo. Protege los brotes y frutos pequeños con un cúprico registrado.'),
  limon_sarna: I('Sarna', 'Elsinoë fawcettii', 'Poda para ventilar y protege los brotes nuevos y la caída de pétalos con un cúprico registrado.'),
  limon_fumagina: I('Fumagina', 'Capnodium spp. (crece sobre la melaza de insectos)', 'El hongo vive de la melaza de pulgones, queresas o mosca blanca: controla a esos insectos con jabón potásico, aceite agrícola o un insecticida registrado. Sin melaza, la fumagina se seca y se cae.'),
  limon_minador: I('Minador de la hoja', 'Phyllocnistis citrella', 'Ataca solo los brotes tiernos. Protégelos durante la brotación con aceite agrícola o un insecticida registrado y evita el exceso de abono nitrogenado, que provoca brotes fuera de época.'),
  naranja_sana: SANA,
  naranja_cancrosis: I('Cancrosis', 'Xanthomonas citri subsp. citri', 'Poda y quema las ramas con lesiones, desinfecta las tijeras y protege los brotes nuevos y frutos pequeños con un cúprico registrado. Controla el minador: sus heridas facilitan la infección.', 'alta'),
  naranja_hlb: I('HLB (enverdecimiento o greening)', 'Candidatus Liberibacter spp. (lo transmite el psílido Diaphorina citri)', 'No tiene cura. Confírmalo con un análisis de laboratorio y avisa a SENASA: es una plaga bajo vigilancia oficial. Controla el psílido y no saques plantas ni varetas de esta huerta.', 'critica'),
  naranja_mancha_negra: I('Mancha negra', 'Phyllosticta citricarpa', 'Recoge y entierra las hojas y frutos caídos, y protege los frutos desde la caída de pétalos con un fungicida registrado. Pide a SENASA o a un agrónomo que la confirme: afecta la venta de fruta.', 'alta'),
  naranja_melanosis: I('Melanosis', 'Diaporthe citri', 'Poda y saca de la huerta las ramas secas, que es donde vive el hongo. Protege los brotes y frutos pequeños con un cúprico registrado.'),
  naranja_sarna: I('Sarna', 'Elsinoë fawcettii', 'Poda para ventilar y protege los brotes nuevos y la caída de pétalos con un cúprico registrado.'),
  naranja_fumagina: I('Fumagina', 'Capnodium spp. (crece sobre la melaza de insectos)', 'El hongo vive de la melaza de pulgones, queresas o mosca blanca: controla a esos insectos con jabón potásico, aceite agrícola o un insecticida registrado. Sin melaza, la fumagina se seca y se cae.'),
  naranja_minador: I('Minador de la hoja', 'Phyllocnistis citrella', 'Ataca solo los brotes tiernos. Protégelos durante la brotación con aceite agrícola o un insecticida registrado y evita el exceso de abono nitrogenado, que provoca brotes fuera de época.'),
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
