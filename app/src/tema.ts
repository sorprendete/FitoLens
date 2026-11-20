// Misma paleta que la web: azul noche con turquesa, violeta, rosa y ámbar. Verde solo para "sana".
export const C = {
  fondo: '#080c1a', fondo2: '#0f1528', sup: '#121a30', sup2: '#18213b', borde: '#222c48', borde2: '#313d60',
  texto: '#eef2fb', tenue: '#95a0bd', acento: '#22d3ee', acento2: '#a78bfa', rosa: '#f472b6', oro: '#fbbf24',
  coral: '#fb7185', sana: '#34d399',
}

// Brillo fino alrededor de una tarjeta, del color que lleva el significado.
export const brillo = (color: string) => ({
  borderColor: color + '66', shadowColor: color, shadowOpacity: 0.45, shadowRadius: 14,
  shadowOffset: { width: 0, height: 0 }, elevation: 6,
})
