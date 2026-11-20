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

**Foto volteada cuando duda** (`VOLTEO`, `pipeline.LIMITE_VOLTEO`): cada ONNX ya promedia la foto con su espejo izquierda-derecha. Si el router o el especialista quedan por debajo de 70 % de confianza, se repite con la foto de cabeza y se promedian los logits (y el mapa de calor, ya enderezado). Lo usa ~1 de cada 5 fotos. En las 236 fotos de campo de PlantDoc test: errores 17 → 14, aciertos 173 → 176; +38 ms en promedio (p95 +110 ms). Giros de 90° y recortes no ayudaron. Medición: `pruebas/volteo/medir.py`.

**Ubicación de la hoja** (`app/ia/segmentacion.py`): U2-Net-p (4.6 MB, Apache 2.0, ONNX de rembg fijado a 192 px, en `app/ia/recursos/`) corre en un hilo paralelo al router y al especialista (~80 ms en CPU; añade ~1 ms al total). Devuelve `mascara_ok` y `contorno_hoja` (polígonos `[x, y]` en 0-1) y recorta el mapa de calor a la hoja. El clasificador sigue viendo la foto completa: la segmentación no cambia ningún diagnóstico. Respaldo seguro (`mascara_ok=false`, foto completa como antes) si el modelo falta o falla, si tarda más de 2 s, si la máscara es vacía, menor al 2 % o mayor al 95 % de la foto, si su nitidez es menor a 0.66 (o el núcleo seguro menor a 75 %), si en cacao la forma no es convexa como una mazorca (solidez < 0.75), o si menos del 40 % de la atención del modelo cae dentro de ella. `SEGMENTACION=false` la apaga.

## Endpoints

| Método | Ruta | Auth |
|---|---|---|
| POST | `/api/diagnostico` (multipart: `imagen`, opcionales `provincia`, `latitud`, `longitud`, `origen`) | opcional (con token queda en el historial) |
| POST | `/api/reporte/{id}` (multipart: `imagen`, la misma foto del diagnóstico) → PDF A4 con foto, cultivo, enfermedad, confianza, tratamiento, fecha y ubicación | no |
| GET | `/api/metricas` | no |
| GET | `/api/brotes?desde=YYYY-MM-DD` | no |
| POST | `/api/auth/login` · `/api/auth/registro` · GET `/api/auth/yo` | — |
| GET | `/api/historial?limite=50` | sí (admin ve todo) |
| POST | `/api/dispositivos` `{email, password, nombre_dispositivo}` → token de la app (dura `JWT_DIAS_DISPOSITIVO`, 90 días) · GET `/api/dispositivos` · DELETE `/api/dispositivos/{id}` (desvincular) | — / sí |
| POST | `/api/sincronizar` (multipart: `imagen`, `id_cliente`, `estado`, `fecha`, opcionales `cultivo`, `clase`, `confianza`, `modelo_version`, `duracion_ms`, `provincia`, `latitud`, `longitud`) → `{id, id_cliente, nuevo}`. Guarda el resultado del teléfono con la fecha de la foto; el mismo `id_cliente` no se duplica | sí |
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
| `VOLTEO` | true | Si el modelo duda (confianza < 70 %), mira también la foto volteada arriba-abajo y promedia |
| `SEGMENTACION` | true | Ubica la hoja para el contorno y el mapa de calor |
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
