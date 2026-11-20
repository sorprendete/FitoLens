# Instrucciones para agentes de código (Antigravity / agy)

FitoLens: diagnóstico de enfermedades de cultivos con IA (café, cacao, papa, tomate, pimiento, maíz, limón, naranja).
Todo el código, los comentarios y los textos de la interfaz van en **español**, con el mismo estilo del código vecino.

## Estructura
- `api/` FastAPI + ONNX Runtime (Python 3.12). Rutas en `app/rutas/`, IA en `app/ia/`, seguridad en `app/seguridad/`.
- `web/` React + Vite (JS). Páginas en `src/paginas/`, componentes en `src/componentes/`, datos en `src/datos/`.
- `bot/` bot de Telegram (python-telegram-bot).
- `app/` app móvil Expo / React Native (TypeScript). Pantallas en `App.tsx` y `src/`.
- `despliegue/` Docker Compose, Caddy, scripts del VPS. **No tocar.**
- `entrenamiento/` notebooks y scripts de modelos.

## Reglas
1. Haz cambios pequeños y enfocados en lo que pide la tarea. No reformatees archivos enteros ni renombres cosas sin que te lo pidan.
2. No toques: `despliegue/`, `.env`, `.gitignore`, `app/assets/modelos/`, `api/app/ia/recursos/*.onnx`, migraciones de alembic ya existentes.
3. No hagas `git commit`, `git push`, ni despliegues. El revisor (Claude) revisa tu diff, corre las pruebas y sube.
4. No agregues dependencias nuevas salvo que la tarea lo pida; si hace falta una, dilo en tu respuesta final.
5. Si cambias la API, agrega o ajusta pruebas en `api/tests/`.
6. Los catálogos de clases existen en 4 copias que deben coincidir: `api/app/reporte/consejos.py`, `bot/app/consejos.py`, `web/src/datos/clases.js`, `app/src/catalogo.ts`.
7. La app móvil debe respetar safe areas (react-native-safe-area-context) y verse bien en pantallas pequeñas.

## Comandos
**No ejecutes comandos de terminal** (en este equipo están bloqueados y cualquier intento corta tu trabajo).
Solo lee y edita archivos. El revisor corre las pruebas por ti:
- API: desde `api/`: `python -X utf8 -m pytest tests -q -p no:cacheprovider`
- Web: desde `web/`: `npm run build`
- App: desde `app/`: `npx tsc --noEmit`
Si cambias la API, escribe o ajusta la prueba en `api/tests/` aunque no puedas correrla.

## Respuesta final
Termina con: lista de archivos cambiados, qué hiciste en cada uno, resultado de las pruebas, y cualquier duda o riesgo.
