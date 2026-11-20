# FitoLens API

FastAPI + ONNX Runtime (CPU) + PostgreSQL. Documentación interactiva en `/api/docs`.

## Cómo está organizada

```
app/
├─ core/       config.py (todo sale del .env) · logs.py
├─ seguridad/  claves (bcrypt, JWT) · limites (fotos por IP) · fuerza_bruta · auditoria · amenazas (reglas + Isolation Forest) · simulacion
├─ db/         modelos.py (tablas) · sesion.py (conexión)
├─ ia/         manifest.py · modelo.py (un ONNX) · registro.py (carga modelos/) · pipeline.py · mapa_calor.py · imagen.py
├─ rutas/      diagnostico · metricas · brotes · auth · historial · admin · salud
├─ esquemas.py formas de entrada y salida
└─ main.py
alembic/       migraciones de la base de datos
scripts/       crear_modelos_falsos.py
tests/         pytest con SQLite y modelos falsos
```

Flujo de `POST /api/diagnostico`: foto validada → **router** (¿qué cultivo?; rechaza otra planta o no planta) → **especialista** del cultivo → **calibración** (softmax con temperatura y umbral; por debajo, "no concluyente") → **mapa de calor** (CAM de la clase ganadora) → se guarda en `diagnosticos`.

## Endpoints

| Método | Ruta | Auth |
|---|---|---|
| POST | `/api/diagnostico` (multipart: `imagen`, opcionales `provincia`, `latitud`, `longitud`, `origen`) | opcional (con token queda en el historial) |
| POST | `/api/reporte/{id}` (multipart: `imagen`, la misma foto del diagnóstico) → PDF A4 con foto, cultivo, enfermedad, confianza, tratamiento, fecha y ubicación | no |
| GET | `/api/metricas` | no |
| GET | `/api/brotes?desde=YYYY-MM-DD` | no |
| POST | `/api/auth/login` · `/api/auth/registro` · GET `/api/auth/yo` | — |
| GET | `/api/historial?limite=50` | sí (admin ve todo) |
| GET | `/api/admin/resumen` · `/api/admin/usuarios` · `/api/admin/auditoria?limite&desde&accion&estado` · `/api/admin/amenazas?dias&simulado` | admin |
| POST | `/api/admin/usuarios/{id}/estado` `{activo}` | admin |
| GET | `/api/salud` | no |

## Seguridad

- **Contraseñas** con bcrypt; sesión con JWT firmado (`JWT_SECRETO`). El rol y si la cuenta está activa se leen de la base en cada petición: desactivar una cuenta o quitarle el rol admin surte efecto al instante.
- **Fuerza bruta**: 5 fallos del mismo correo o 20 desde la misma IP en 15 min → 429 y evento `bloqueado`. El umbral por IP es más alto porque en la feria muchos comparten el mismo wifi. Se cuenta en la tabla `auditoria`, así vale para todos los procesos y sobrevive a reinicios.
- **Límite de fotos** por IP y minuto (`LIMITE_DIAGNOSTICOS_MINUTO`).
- **Validación de imágenes**: tipo real por firma (JPG, PNG, WebP), tamaño, bombas de descompresión y archivos dañados.
- **Integridad de modelos**: cada `model.onnx` se verifica con el SHA-256 de su manifest; si no coincide, no se carga.
- **Auditoría**: login, registro, diagnóstico y acciones de admin, con IP y navegador. La IP se toma de la última entrada de `X-Forwarded-For` (la que pone Caddy), así el cliente no puede falsificarla.
- **Detección de amenazas**: reglas (fuerza bruta, prueba de contraseñas en muchas cuentas, sondeo del modelo, ráfagas, creación masiva de cuentas, scripts) + Isolation Forest no supervisado sobre la auditoría. `simulado=true` usa tráfico de prueba para la demo.

Provincias válidas: bellavista, el_dorado, huallaga, lamas, mariscal_caceres, moyobamba, picota, rioja, san_martin, tocache.

## Variables de entorno

| Variable | Por defecto | Qué hace |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://fitolens:fitolens@db:5432/fitolens` | Base de datos |
| `JWT_SECRETO` | (obligatorio, ≥ 32 caracteres) | `openssl rand -hex 32` |
| `JWT_MINUTOS` | 720 | Duración de la sesión |
| `ADMIN_USUARIO` / `ADMIN_CLAVE` | — | Admin que se crea al arrancar si no existe |
| `REGISTRO_ABIERTO` | false | Permite crear cuentas desde la web |
| `MODELOS_DIR` | `/modelos` | Carpeta de modelos (ver `docs/contrato_modelos.md`) |
| `ORT_HILOS` | 2 | Hilos de ONNX Runtime por modelo |
| `API_WORKERS` | 2 | Procesos de uvicorn |
| `MAX_IMAGEN_MB` | 8 | Tamaño máximo de foto |
| `LIMITE_DIAGNOSTICOS_MINUTO` | 20 | Fotos por minuto por IP |
| `LOGIN_MAX_FALLOS` / `LOGIN_MAX_FALLOS_IP` / `LOGIN_BLOQUEO_MINUTOS` | 5 / 20 / 15 | Bloqueo por fuerza bruta |
| `GUARDAR_IMAGENES` / `IMAGENES_DIR` | false / `/datos/imagenes` | Guarda fotos de campo para reentrenar |
| `CORS_ORIGENES` | vacío | Solo si la web está en otro dominio |
| `LOG_NIVEL` | INFO | |

## Mantenimiento

- **Cambiar un modelo**: reemplaza su carpeta en `modelos/` y `docker compose restart api`. Si el SHA-256 no coincide, ese modelo no se carga y aparece en `errores_modelos` de `/api/salud`.
- **Cambiar una tabla**: edita `app/db/modelos.py` y `alembic revision --autogenerate -m "qué cambió"`. La migración se aplica sola al arrancar.
- **Añadir un cultivo**: entrena su especialista, ponlo en `modelos/<nombre>/` y agrégalo a `especialistas` del manifest del router. Sin código.

## Desarrollo local

```bash
pip install -r requirements-dev.txt
python scripts/crear_modelos_falsos.py ../modelos
pytest -q
```
