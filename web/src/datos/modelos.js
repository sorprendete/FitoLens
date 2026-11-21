// Nombres legibles para personas de cada modelo de IA de FitoLens.
export const NOMBRES_MODELO = {
  citricos: 'Limon y naranja',
  maiz: 'Maiz',
  cafe: 'Cafe',
  cacao: 'Cacao',
  hortalizas: 'Papa, tomate y pimiento',
  router: 'Reconocedor de cultivo',
}

export function nombreModelo(id) {
  if (!id) return ''
  return NOMBRES_MODELO[id] ?? NOMBRES_MODELO[id.toLowerCase()] ?? id
}
