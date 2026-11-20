// Colores con significado. Ningún color de un gráfico es decorativo:
// - ESTADO: resultado de un diagnóstico (sana, enfermedad, no concluyente, rechazada).
// - Cada cultivo tiene su color fijo en datos/clases.js (CULTIVOS[x].color), igual en toda la web.
// - INTENSIDAD: cantidad de casos (mapa de brotes), de pocos (amarillo claro) a muchos (rojo oscuro).
export const ESTADO = {
  sana: { nombre: 'Sana', color: '#34d399' },
  enferma: { nombre: 'Con enfermedad', color: '#f87171' },
  no_concluyente: { nombre: 'No concluyente', color: '#fbbf24' },
  rechazada: { nombre: 'Foto rechazada', color: '#94a3b8' },
}
export const INTENSIDAD = ['#fde68a', '#fb923c', '#ef4444', '#991b1b']

// Mezcla lineal entre colores (#rrggbb) para escalas continuas. t de 0 a 1.
export function escala(t, paradas = INTENSIDAD) {
  const x = Math.min(1, Math.max(0, t)) * (paradas.length - 1)
  const i = Math.min(paradas.length - 2, Math.floor(x)), f = x - i
  const a = paradas[i].match(/\w\w/g).map((h) => parseInt(h, 16)), b = paradas[i + 1].match(/\w\w/g).map((h) => parseInt(h, 16))
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(' ')})`
}
