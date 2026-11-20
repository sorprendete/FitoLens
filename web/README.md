# web: interfaz de FitoLens

React 19 + Vite, sin librerías de gráficos ni de mapas (todo es SVG y CSS propio). Pesa ~85 KB comprimido.

## Secciones (navegación por `#`)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `#diagnostico` | `src/paginas/Diagnostico.jsx` | Cámara o foto → resultado, mapa de calor, pasos de la IA, consejo |
| `#como-piensa` | `src/paginas/ComoPiensa.jsx` | Explica router → especialista → calibración → mapa de calor, con demo del umbral |
| `#brotes` | `src/paginas/Brotes.jsx` | Mapa de las 10 provincias de San Martín, se refresca cada 30 s |
| `#modelos` | `src/paginas/Modelos.jsx` | Acierto en campo, F1 y matriz de confusión de cada modelo |

## Dónde se cambia cada cosa

- **Configuración**: `src/config.js` (lee `VITE_*`, ver `.env.example`). En el VPS no hace falta nada: la API está en `/api` del mismo dominio.
- **Llamadas a la API**: solo en `src/api/cliente.js`. Contrato en `PLAN.md` §6.
- **Nombres y consejos de cada enfermedad**: `src/datos/clases.js`. Si la API envía `etiqueta`, se usa esa. Una clase nueva sin entrada aquí se muestra igual, con su id legible.
- **Colores**: variables al inicio de `src/estilos.css` (tema oscuro y claro automático).
- **Mapa**: `src/datos/provincias.js` es generado (fuente: juaneladio/peru-geojson, INEI); no se edita a mano.

## Modo demostración

Si la API no responde (o `VITE_MODO_DEMO=true`), la web usa `src/api/mocks.js` y muestra la etiqueta
**Modo demostración**. Los mocks no son resultados reales. Para que nunca se usen: `VITE_MODO_DEMO=false`.

## Comandos

```bash
npm install
npm run dev        # http://localhost:5173 (reenvía /api a localhost:8000; otro destino: API_DEV=http://ip:8000)
npm run build      # genera dist/
docker build -t fitolens-web .   # imagen nginx en el puerto 80
```

La cámara en vivo necesita HTTPS (o localhost). En el VPS Caddy pone el HTTPS.
