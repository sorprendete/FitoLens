// Única fuente de configuración de la web. Los valores vienen de variables VITE_* (ver .env.example).
export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

// 'true' = siempre datos de ejemplo; 'false' = nunca; vacío = automático (si la API no responde).
export const MODO_DEMO = import.meta.env.VITE_MODO_DEMO || ''

// Tiempo máximo de espera de la API (ms). Un CPU sin GPU tarda menos de 1 s por foto.
export const TIEMPO_ESPERA = 20000

// Cada cuánto se actualiza el mapa de brotes (ms).
export const REFRESCO_BROTES = 30000
