# web: interfaz de FitoLens

React 19 + Vite, sin librerías de gráficos ni de mapas (todo es SVG y CSS propio). Pesa ~85 KB comprimido.

## Secciones (navegación por `#`, definidas en `src/rutas.js`)

| Acceso | Secciones |
|---|---|
| Público (también "Probar sin cuenta") | Diagnóstico, Mapa de brotes, Cómo piensa la IA, Precisión en campo |
| Con cuenta | Panel (gráficos), Historial (filtros y CSV) |
| Solo admin | Usuarios (activar/desactivar), Auditoría, Detector de amenazas (reglas + Isolation Forest), Matriz de riesgos |

La portada (`#acceso` / `#registro`) es `src/paginas/Acceso.jsx`. La sesión (JWT de la API) vive en `src/contexto/Sesion.jsx`.
Las rutas protegidas se comprueban en la web **y en la API**: la web nunca es la única barrera.

## Dónde se cambia cada cosa

- **Configuración**: `src/config.js` (lee `VITE_*`, ver `.env.example`). En el VPS no hace falta nada: la API está en `/api` del mismo dominio.
- **Llamadas a la API**: solo en `src/api/cliente.js`. Contrato en `PLAN.md` §6.
- **Nombres y consejos de cada enfermedad**: `src/datos/clases.js`. Si la API envía `etiqueta`, se usa esa. Una clase nueva sin entrada aquí se muestra igual, con su id legible.
- **Colores**: variables al inicio de `src/estilos.css` (tema oscuro y claro; el botón de la barra lo cambia y se recuerda).
- **Matriz de riesgos**: `src/datos/riesgos.json`.
- **Agregar una sección**: crear la página en `src/paginas/` y añadir una línea en `src/rutas.js`.
- **Mapa**: `src/datos/provincias.js` es generado (fuente: juaneladio/peru-geojson, INEI); no se edita a mano.

## Modo demostración

Si la API no responde, diagnóstico, brotes y métricas usan `src/api/mocks.js` y la web muestra **Modo demostración**.
Cuentas, historial y administración nunca se simulan (salvo `VITE_MODO_DEMO=true`, solo para diseñar sin servidor).
Para que nunca se usen mocks: `VITE_MODO_DEMO=false`.

## Comandos

```bash
npm install
npm run dev        # http://localhost:5173 (reenvía /api a localhost:8000; otro destino: API_DEV=http://ip:8000)
npm run build      # genera dist/
docker build -t fitolens-web .   # imagen nginx en el puerto 80
```

La cámara en vivo necesita HTTPS (o localhost). En el VPS Caddy pone el HTTPS.
