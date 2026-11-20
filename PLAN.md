# FitoLens: plan y arquitectura (v2, 20 nov 2026)

Objetivo: demo sólida en la EXPOFERIA FISI 2026 (UNSM, 25 nov 2026), desplegada en el VPS Contabo (16 GB RAM, 200 GB, **sin GPU**), con el mejor acierto posible en **fotos de campo** y fácil de mantener. FitoScan no se toca.

## 1. Principios de mantenimiento

- **Un solo repositorio** (monorepo `FitoLens`) y **un solo comando** para levantar todo: `docker compose up -d`.
- **Todo en el VPS**: se dejan Supabase y Vercel. Base de datos, API, web y bot corren en contenedores propios.
- **Modelos como archivos versionados**, separados del código: cambiar un modelo = copiar una carpeta y reiniciar la API. Sin tocar código.
- **Configuración solo en `.env`**, sin valores dentro del código.
- **Entrenar fuera, servir en el VPS**: se entrena con GPU gratuita (Kaggle: 30 h/semana; o Colab) y se exporta a ONNX. El VPS solo hace inferencia en CPU con ONNX Runtime, más liviano que TensorFlow.

## 2. Arquitectura en el VPS

```
Internet ─► Caddy (HTTPS automático, Let's Encrypt)
              ├─ /          → web (React compilado, archivos estáticos)
              ├─ /api/*     → api (FastAPI + ONNX Runtime)
              └─ /bot/*     → bot (webhook de Telegram, opcional)
            api ─► postgres (diagnósticos, usuarios, brotes)
            backup (cron) ─► pg_dump diario, rotación de 14 días
```

Contenedores (`docker-compose.yml`): `caddy`, `web`, `api`, `db` (PostgreSQL 16), `bot`, `backup`.
Despliegue: GitHub Actions construye las imágenes, las publica en GHCR y en el VPS se ejecuta `docker compose pull && docker compose up -d`.

## 3. Estructura del repositorio

```
FitoLens/
├─ api/                 FastAPI
│  ├─ app/
│  │  ├─ core/          config (.env), seguridad, logs
│  │  ├─ ia/            carga de modelos, pipeline, mapas de calor
│  │  ├─ rutas/         diagnostico, historial, brotes, metricas, auth
│  │  ├─ db/            modelos SQLAlchemy + migraciones Alembic
│  │  └─ main.py
│  └─ tests/
├─ web/                 React + Vite
├─ bot/                 bot de Telegram (llama a la API, no tiene IA propia)
├─ modelos/             NO va en git: se descarga de un Release
│  ├─ router/  hortalizas/  cafe/  cacao/
│  │   └─ model.onnx · manifest.json · metricas.json
├─ entrenamiento/       notebooks de Kaggle/Colab + scripts reproducibles
├─ despliegue/          docker-compose.yml, Caddyfile, .env.example, backup.sh
└─ docs/                arquitectura, mantenimiento, fichas de modelos
```

## 4. Arquitectura de IA

1. **Router**: decide entre pimiento, papa, tomate, café, cacao, otra planta o no es planta. Si es "otra" o "no planta", rechaza.
2. **Especialista por cultivo**: un modelo por cultivo. Así cada uno se reentrena sin afectar a los demás.
3. **Calibración** (temperature scaling) para que el 80 % de confianza signifique de verdad un 80 % de acierto. Umbral por cultivo, fijado con datos de validación de campo. Por debajo del umbral: **no concluyente**.
4. **Mapa de calor (CAM)**: los modelos terminan en GlobalAveragePooling + Dense, así que el mapa se calcula exactamente con los pesos de la última capa y las activaciones. No hacen falta gradientes y funciona en ONNX y en CPU.
5. **Contrato de cada modelo** (`manifest.json`): nombre, versión, clases, tamaño de entrada, normalización, umbral, temperatura, SHA-256 y la fecha y los datos con que se entrenó.

### Receta de entrenamiento (enfocada en campo)

- Backbone: **EfficientNetV2-B2** o **ConvNeXt-Tiny** (preentrenados en ImageNet), entrada 260–288 px. Se elige el de mejor acierto en campo con menos de 300 ms por foto en el CPU del VPS.
- Datos: **laboratorio + campo mezclados**. El conjunto de prueba es **solo de campo** y no se usa para elegir épocas: se separa en entrenamiento, validación y prueba.
- Aumentos que imitan el campo: recorte aleatorio, cambios de luz y color, desenfoque, ruido JPEG y **reemplazo del fondo** (lo que mejoró el filtro v3 de FitoScan).
- Dos fases: primero la cabeza, luego ajuste fino completo con lr baja + label smoothing. TTA (foto original + espejo) al evaluar.
- Se reportan: accuracy, F1 macro y la matriz de confusión **en campo**. No se prometen cifras antes de medir.

## 5. Datasets

Verificados (19 nov 2026):
- **Café**: *Coffee leaf dataset by phytosanitary class* (Mendeley 10.17632/mfpxg4y65r.2, CC BY 4.0). 1,500 hojas fotografiadas en Saposoa: sana, roya (*Hemileia vastatrix*) y *Mycena citricolor*.
- **Cacao**: *CocoaMoniliaDataSet* (Zenodo 10.5281/zenodo.17716661, CC BY 4.0). 1,953 fotos de mazorcas en campo (Colombia): sana y 3 estadios de *Moniliophthora roreri*. Además, Kaggle *serranosebas/enfermedades-cacao-yolov4* (ODbL): 312 fotos con sana, phytophthora y monilia.

Candidatos a verificar en el hilo de datos (no confirmados todavía):
- Hortalizas en campo: PlantDoc, PlantWild / PlantSeg, conjuntos de papa en entorno no controlado de Data in Brief/Mendeley.
- Café adicional: RoCoLe (robusta, campo), BRACOL, JMuBEN.
- Cacao adicional: otros conjuntos de mazorca negra.

Regla: cada dataset entra con su licencia y su cita en `docs/datos.md`. Se deduplica por hash perceptual para que una misma foto no quede en entrenamiento y prueba a la vez.

## 6. API (contrato para trabajar en paralelo)

- `POST /api/diagnostico` (imagen) → `{cultivo, estado: diagnostico|no_concluyente|rechazada, clase, confianza, top3, mapa_calor_png_base64, pasos[], modelo_version}`
- `GET /api/metricas` → contenido de `metricas.json` de cada modelo
- `GET /api/brotes?desde=` → conteos por provincia de San Martín y enfermedad
- `POST /api/auth/login`, `GET /api/historial` (JWT propio)
- `GET /api/salud`

## 7. División en hilos (en paralelo)

| Hilo | Entrega | Depende de |
|---|---|---|
| A. Datos y entrenamiento | notebooks de Kaggle, `model.onnx` + manifest + métricas de campo por cultivo | Ronald ejecuta los notebooks en Kaggle con GPU |
| B. API | FastAPI, pipeline ONNX, CAM, Postgres, auth, tests | contrato de §4–6 (puede usar modelos falsos al inicio) |
| C. Web | React: diagnóstico con cámara, mapa de calor, "cómo piensa la IA", mapa de brotes, métricas | contrato de §6 |
| D. Infraestructura | docker-compose, Caddy, CI/CD, backups, guía de mantenimiento, QR | dominio o IP del VPS |
| E. Bot de Telegram | después de B | API |

## 8. Calendario

- **20 nov**: repositorio y esqueleto; arrancan A, B, C y D.
- **21–22 nov**: entrenamiento y evaluación en campo; integración de la API con los modelos reales.
- **23 nov**: despliegue en el VPS, HTTPS, QR y bot.
- **24 nov**: ensayo general y congelamiento. Plan B: mismo `docker compose` en la laptop, sin internet.
