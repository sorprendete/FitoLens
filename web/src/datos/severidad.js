// Severidad de una parcela, estimada por el agricultor en cada visita (escala de campo de 4 niveles).
// Verde solo para "sin síntomas" (planta sana); de naranja a rojo oscuro, cuanto más daño.
export const SEVERIDAD = [
  { valor: 0, nombre: 'Sin síntomas', detalle: 'Ninguna hoja o fruto afectado', color: '#34d399' },
  { valor: 1, nombre: 'Leve', detalle: 'Menos del 10 % de hojas o frutos', color: '#fb923c' },
  { valor: 2, nombre: 'Moderada', detalle: 'Entre 10 y 30 %', color: '#ef4444' },
  { valor: 3, nombre: 'Grave', detalle: 'Más del 30 %', color: '#b91c1c' },
]
// Tendencia: última visita comparada con la visita del primer tratamiento (o con la primera visita).
export const TENDENCIA = {
  mejora: { nombre: 'Mejorando', clase: 'acento' },
  empeora: { nombre: 'Empeorando', clase: 'mal' },
  igual: { nombre: 'Sin cambios', clase: 'neutro' },
  sin_datos: { nombre: 'Faltan visitas', clase: 'neutro' },
}
