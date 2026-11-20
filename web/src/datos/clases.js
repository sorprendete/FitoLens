// Nombres y consejos por clase. La API puede enviar su propia "etiqueta"; si no, se usa este catálogo.
// Color fijo por cultivo, representativo: café = marrón del grano tostado, cacao = naranja de la mazorca,
// papa = morado de la papa nativa, tomate = rojo del fruto, pimiento = amarillo del morrón,
// maíz = dorado del grano seco, limón = verde del limón, naranja = naranja del fruto maduro.
// Ids: snake_case en español con prefijo de cultivo (mismo criterio que manifest.json de cada modelo).
// Las dosis se toman siempre de la etiqueta del producto registrado en SENASA.

export const CULTIVOS = {
  cafe: { nombre: 'Café', cientifico: 'Coffea arabica', color: '#c08457' },
  cacao: { nombre: 'Cacao', cientifico: 'Theobroma cacao', color: '#f97316' },
  papa: { nombre: 'Papa', cientifico: 'Solanum tuberosum', color: '#a78bfa' },
  tomate: { nombre: 'Tomate', cientifico: 'Solanum lycopersicum', color: '#ef4444' },
  pimiento: { nombre: 'Pimiento', cientifico: 'Capsicum annuum', color: '#facc15' },
  maiz: { nombre: 'Maíz', cientifico: 'Zea mays', color: '#b45309' },
  limon: { nombre: 'Limón', cientifico: 'Citrus × aurantiifolia / C. limon', color: '#84cc16' },
  naranja: { nombre: 'Naranja', cientifico: 'Citrus × sinensis', color: '#ea580c' },
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
  tomate_septoriosis: C('Mancha por Septoria', 'Septoria lycopersici', 'Retira hojas bajas, riega al pie y aplica un fungicida protector registrado.'),
  tomate_arana_roja: C('Ácaro de dos manchas', 'Tetranychus urticae', 'Revisa el envés, lava con agua a presión y usa un acaricida registrado si la plaga sigue.'),
  tomate_mancha_diana: C('Mancha diana', 'Corynespora cassiicola', 'Mejora la ventilación y aplica un fungicida registrado.'),
  tomate_virus_rizado_amarillo: C('Virus del rizado amarillo', 'TYLCV (mosca blanca)', 'Arranca plantas enfermas y controla la mosca blanca. Un virus no se cura con fungicida.', 'alta'),
  tomate_virus_mosaico: C('Virus del mosaico', 'ToMV', 'Arranca plantas enfermas y desinfecta manos y herramientas. Un virus no se cura con fungicida.', 'alta'),
  pimiento_sana: SANA,
  pimiento_mancha_bacteriana: C('Mancha bacteriana', 'Xanthomonas spp.', 'Evita mojar el follaje, retira hojas afectadas y usa productos cúpricos registrados.'),
  maiz_sana: SANA,
  maiz_tizon_hoja: C('Tizón de la hoja', 'Exserohilum turcicum', 'Siembra variedades o híbridos tolerantes, rota con otro cultivo y no dejes rastrojo enfermo en la chacra. Si avanza antes de la floración y llueve seguido, aplica un fungicida registrado.'),
  maiz_roya_comun: C('Roya común', 'Puccinia sorghi', 'Usa variedades resistentes en la próxima siembra. Si las pústulas suben a las hojas de arriba antes de la floración, aplica un fungicida registrado.'),
  maiz_mancha_gris: C('Mancha gris', 'Cercospora zeae-maydis', 'Rota con otro cultivo, entierra o retira el rastrojo enfermo y siembra híbridos tolerantes. Si sube a la hoja de la mazorca con clima húmedo, aplica un fungicida registrado.'),
  maiz_gusano_cogollero: C('Gusano cogollero', 'Spodoptera frugiperda', 'Revisa el cogollo de las plantas jóvenes dos veces por semana. Si hay larvas vivas en varias plantas, aplica un insecticida registrado o uno biológico (Bacillus thuringiensis) dirigido al cogollo, al atardecer.', 'alta'),
  limon_sana: SANA,
  limon_cancrosis: C('Cancrosis', 'Xanthomonas citri subsp. citri', 'Poda y quema las ramas con lesiones, desinfecta las tijeras y protege los brotes nuevos y frutos pequeños con un cúprico registrado. Controla el minador: sus heridas facilitan la infección.', 'alta'),
  limon_hlb: C('HLB (enverdecimiento o greening)', 'Candidatus Liberibacter spp. (lo transmite el psílido Diaphorina citri)', 'No tiene cura. Confírmalo con un análisis de laboratorio y avisa a SENASA: es una plaga bajo vigilancia oficial. Controla el psílido y no saques plantas ni varetas de esta huerta.', 'critica'),
  limon_mancha_negra: C('Mancha negra', 'Phyllosticta citricarpa', 'Recoge y entierra las hojas y frutos caídos, y protege los frutos desde la caída de pétalos con un fungicida registrado. Pide a SENASA o a un agrónomo que la confirme: afecta la venta de fruta.', 'alta'),
  limon_melanosis: C('Melanosis', 'Diaporthe citri', 'Poda y saca de la huerta las ramas secas, que es donde vive el hongo. Protege los brotes y frutos pequeños con un cúprico registrado.'),
  limon_sarna: C('Sarna', 'Elsinoë fawcettii', 'Poda para ventilar y protege los brotes nuevos y la caída de pétalos con un cúprico registrado.'),
  limon_fumagina: C('Fumagina', 'Capnodium spp. (crece sobre la melaza de insectos)', 'El hongo vive de la melaza de pulgones, queresas o mosca blanca: controla a esos insectos con jabón potásico, aceite agrícola o un insecticida registrado. Sin melaza, la fumagina se seca y se cae.'),
  limon_minador: C('Minador de la hoja', 'Phyllocnistis citrella', 'Ataca solo los brotes tiernos. Protégelos durante la brotación con aceite agrícola o un insecticida registrado y evita el exceso de abono nitrogenado, que provoca brotes fuera de época.'),
  naranja_sana: SANA,
  naranja_cancrosis: C('Cancrosis', 'Xanthomonas citri subsp. citri', 'Poda y quema las ramas con lesiones, desinfecta las tijeras y protege los brotes nuevos y frutos pequeños con un cúprico registrado. Controla el minador: sus heridas facilitan la infección.', 'alta'),
  naranja_hlb: C('HLB (enverdecimiento o greening)', 'Candidatus Liberibacter spp. (lo transmite el psílido Diaphorina citri)', 'No tiene cura. Confírmalo con un análisis de laboratorio y avisa a SENASA: es una plaga bajo vigilancia oficial. Controla el psílido y no saques plantas ni varetas de esta huerta.', 'critica'),
  naranja_mancha_negra: C('Mancha negra', 'Phyllosticta citricarpa', 'Recoge y entierra las hojas y frutos caídos, y protege los frutos desde la caída de pétalos con un fungicida registrado. Pide a SENASA o a un agrónomo que la confirme: afecta la venta de fruta.', 'alta'),
  naranja_melanosis: C('Melanosis', 'Diaporthe citri', 'Poda y saca de la huerta las ramas secas, que es donde vive el hongo. Protege los brotes y frutos pequeños con un cúprico registrado.'),
  naranja_sarna: C('Sarna', 'Elsinoë fawcettii', 'Poda para ventilar y protege los brotes nuevos y la caída de pétalos con un cúprico registrado.'),
  naranja_fumagina: C('Fumagina', 'Capnodium spp. (crece sobre la melaza de insectos)', 'El hongo vive de la melaza de pulgones, queresas o mosca blanca: controla a esos insectos con jabón potásico, aceite agrícola o un insecticida registrado. Sin melaza, la fumagina se seca y se cae.'),
  naranja_minador: C('Minador de la hoja', 'Phyllocnistis citrella', 'Ataca solo los brotes tiernos. Protégelos durante la brotación con aceite agrícola o un insecticida registrado y evita el exceso de abono nitrogenado, que provoca brotes fuera de época.'),
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
