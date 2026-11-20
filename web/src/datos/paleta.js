// Paleta de datos de FitoLens: colores vivos que se distinguen entre sí en tema claro y oscuro.
export const PALETA = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#fb923c', '#60a5fa', '#e879f9']

// Mezcla lineal entre colores (#rrggbb) para escalas continuas. t de 0 a 1.
export function escala(t, paradas = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b']) {
  const x = Math.min(1, Math.max(0, t)) * (paradas.length - 1)
  const i = Math.min(paradas.length - 2, Math.floor(x)), f = x - i
  const a = paradas[i].match(/\w\w/g).map((h) => parseInt(h, 16)), b = paradas[i + 1].match(/\w\w/g).map((h) => parseInt(h, 16))
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(' ')})`
}
