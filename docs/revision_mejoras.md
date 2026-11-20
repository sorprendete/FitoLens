# Revisión de FitoLens: mejoras y arquitectura (20 nov 2026)

Alcance: api/, web/, bot/, app/, despliegue/, docs/. Ver §5 para lo ya aplicado (20 nov).
Leyenda: **[FERIA]** = rápido y de alto impacto antes del 25 nov · **[DESPUÉS]** = después de la feria.

## 1. Veredicto sobre la arquitectura

**Está bien diseñada y es fácil de operar.** Puntos fuertes:
- Un solo `docker compose` y un solo script (`fitolens.sh`) con estado, logs, respaldo, restaurar, volver de versión y Plan B offline.
- Modelos separados del código (carpeta + `manifest.json` con SHA-256): cambiar un modelo no toca código.
- Router → especialista → calibración → umbral "no concluyente": honesto ante el público y fácil de explicar.
- Un modelo roto no tumba la API; `/api/salud` dice qué falta. Logs con tope de tamaño, respaldos diarios con rotación.
- Web, bot y app hablan con un único contrato (`POST /api/diagnostico`). La app reutiliza la misma lógica en el teléfono.

**Nota:** la copia de la nube estaba desactualizada respecto a GitHub en despliegue/ (modo nginx, QR y guía ya estaban corregidos en GitHub). Ya se sincronizó.

## 2. Antes de la feria [FERIA] (ordenado por impacto)

| # | Problema | Efecto en la feria | Propuesta |
|---|---|---|---|
| 1 | **Todas las visitas parecen venir de la misma IP.** Con nginx → Caddy → API, Caddy no confía en nginx y escribe en `X-Forwarded-For` la IP de nginx; la API toma esa última entrada (`seguridad/auditoria.py`). | El límite de 20 fotos/min y el bloqueo de login (20 fallos/IP) se aplican **a todo el público junto**: con un stand concurrido salen "Demasiadas fotos seguidas" y bloqueos de login. Auditoría y detector de amenazas ven una sola IP. | En el Caddyfile real: `{ servers { trusted_proxies static private_ranges } }` y en `reverse_proxy api:8000` añadir `header_up X-Real-IP {client_ip}`. En la API leer primero `X-Real-IP`. nginx debe enviar `X-Forwarded-For $proxy_add_x_forwarded_for`. |
| 2 | **El QR apunta a otra dirección.** `qr_stand.png` y `docs/instalar_vps.md` usan `5.253.232.122.sslip.io`; la app usa `fitolens.5-253-232-122.sslip.io`. | Si nginx sirve otro proyecto en la IP sola, el QR abre el proyecto equivocado o falla. | Confirmar la dirección real en el VPS, regenerar el QR (`scripts/generar_qr.py <url>`) y probarlo con 2 celulares (Android e iPhone) antes de imprimir. |
| 3 | **El repo no refleja el VPS real** (compose publica 80/443 de Caddy). | Un `./fitolens.sh instalar/actualizar` desde el repo puede chocar con nginx o tumbar los otros proyectos. | Subir al repo la configuración real: `ports: ["127.0.0.1:PUERTO:80"]` para Caddy, Caddyfile solo HTTP (nginx pone el HTTPS) y el bloque de nginx en `despliegue/nginx-vps.conf`. Actualizar `instalar_vps.md`. |
| 4 | **La inferencia bloquea la API.** `rutas/diagnostico.py` es `async def` pero ejecuta ONNX y la base de datos de forma síncrona. | Mientras un proceso analiza una foto, no atiende nada más (ni `/salud`, ni brotes, ni login). Con 2 procesos, 3 fotos simultáneas ya hacen cola. | Ejecutar la parte pesada en hilo: `r = await run_in_threadpool(diagnosticar, registro, foto)` (y el guardado en BD igual), o volver la ruta `def` normal. Cambio de 2–3 líneas; correr los tests. |
| 5 | **Primera foto lenta** tras cada reinicio (ONNX inicializa al primer uso). | La primera demo ante autoridades puede tardar varios segundos. | Al cargar el registro, hacer una inferencia de calentamiento con una imagen negra en el router y cada especialista. |
| 6 | **Modo demostración silencioso.** Si la API cae, la web muestra resultados simulados. | Riesgo de mostrar un diagnóstico falso a una autoridad sin notarlo. | En el VPS compilar con `VITE_MODO_DEMO=false` cuando estén los modelos reales; dejar el modo demo solo para el Plan B. |
| 7 | **Modelos falsos aún en `/modelos` y en la app.** | Diagnósticos sin sentido si se despliega antes de tiempo. | Que `/api/salud` y la web muestren la versión del modelo; checklist del 23 nov: subir `modelos-v1` real, verificar con 10 fotos de campo por cultivo y mirar `duracion_ms` (< 1 s). |
| 8 | **APK de la app.** En Expo Go no hay IA offline; el build de EAS gratis puede esperar horas en cola. | Llegar al 25 sin APK instalable. | Lanzar `eas build -p android --profile apk` el 22–23 nov con los modelos reales; tener el APK también en un QR/enlace. iOS solo si hay cuenta Apple. |
| 9 | **Bot por webhook detrás de nginx.** El bot usa webhook si `DOMINIO` existe; nginx debe pasar `/bot/`. | El bot no responde aunque esté "arriba". | Verificar que nginx reenvíe `/bot/` o forzar `BOT_MODO=polling` (no necesita entrada pública; es lo más simple para la feria). |
| 10 | **Recursos del VPS.** `API_WORKERS=2` × `ort_hilos=2`; los otros proyectos comparten CPU. | Bien para la feria si se aplica el #4. | Ver núcleos con `nproc`; mantener 2 procesos y 2 hilos; medir con 5 celulares a la vez el 24 nov. No subir procesos sin medir RAM (cada uno carga todos los modelos). |
| 11 | **Ensayo del Plan B.** | Wifi de la feria saturado o caído. | Probar `./fitolens.sh offline` en la laptop con el hotspot el 24 nov, con los modelos reales copiados. La app offline cubre también este caso. |

Pequeños de usabilidad (web, para el hilo web, todos rápidos):
- Mostrar "Analizando…" con los pasos animados mientras espera, y un botón grande "Tomar otra foto" al terminar.
- En "no concluyente", dar el consejo concreto (más cerca, buena luz, una sola hoja) con una foto de ejemplo.
- Texto grande y alto contraste en el resultado: lo leerán personas mayores con sol en la pantalla.

## 3. Después de la feria [DESPUÉS]

1. **Límite de peticiones compartido** entre procesos (hoy cada proceso tiene su contador en memoria): moverlo a Postgres o Redis.
2. **Cola de inferencia** (un solo proceso de IA con lotes) si crece el uso; ahora no hace falta.
3. **Guardar fotos de campo** (`GUARDAR_IMAGENES=true`, con consentimiento) para reentrenar con datos reales de San Martín: es la mejora de precisión más grande a medio plazo.
4. **Retroalimentación del agricultor/agrónomo** ("¿fue correcto?") guardada con el diagnóstico, para medir acierto real en campo.
5. **Monitoreo simple**: Uptime Kuma o un cron que llame `/api/salud` y avise por el bot de Telegram.
6. **Mismo Python en CI y Docker** (CI usa 3.12, la imagen 3.13).
7. **Respaldo fuera del VPS** (copiar `respaldos/` a Drive o a otro servidor); hoy viven en el mismo disco.
8. **Dominio propio** (p. ej. `fitolens.unsm.edu.pe`) en vez de sslip.io: más confianza ante instituciones.
9. **App**: descarga de modelos nuevos sin recompilar (desde el Release) y sincronización en segundo plano del historial.
10. **Migraciones fuera del arranque**: hoy cada proceso corre `alembic upgrade` al iniciar; pasarlo a un paso único de `actualizar`.

## 4. Orden sugerido para los próximos días

- **21 nov**: #1, #3, #4, #5 (API + configuración del VPS real).
- **22 nov**: #2 (QR), #9 (bot), mejoras de texto de la web.
- **23 nov**: #7 y #8 con los modelos reales; #6.
- **24 nov**: prueba de carga con 5 celulares (#10) y ensayo del Plan B (#11). Congelar.

## 5. Aplicado el 20 nov (parche `entregables/mejoras_feria.patch`, sobre GitHub `d929a49`)

- **IP real**: Caddy (los 3 Caddyfile) envía `X-Real-IP {client_ip}` a la API; la API lo usa primero. Con `trusted_proxies` del modo nginx, cada visitante tiene su IP.
- **Inferencia sin bloquear**: ONNX y la escritura en la base de datos van en hilo aparte (`run_in_threadpool`).
- **Calentamiento**: cada modelo hace una inferencia de prueba al arrancar (el log muestra los ms).
- **/api/salud**: añade `modelos_release` (MODELOS_VERSION) y `modelos_de_prueba` (true mientras haya modelos falsos).
- **Bot**: `BOT_MODO=polling` en `.env.example`.
- **Web**: se compila con `VITE_MODO_DEMO=false` por defecto (Dockerfile + docker-compose + `.env.example`).
- **QR y guía**: ya apuntaban a `https://fitolens.5-253-232-122.sslip.io` en GitHub.
- Pruebas: 21 de 21 pasan (2 nuevas); los 3 Caddyfile validados con Caddy 2.8.4; `docker compose config` OK.

## 6. Checklist para Ronald (necesita VPS, modelos reales o celulares)

- [ ] En el `.env` del VPS añadir `BOT_MODO=polling` y `VITE_MODO_DEMO=false`, y luego `./fitolens.sh actualizar` (reconstruye web y API).
- [ ] Abrir `https://fitolens.5-253-232-122.sslip.io/api/salud`: `modelos_de_prueba` debe ser `false` tras subir `modelos-v1`.
- [ ] **Prueba de 10 fotos de campo por cultivo** con los modelos reales; anotar aciertos y `duracion_ms` (< 1 s).
- [ ] **Prueba con 5 celulares a la vez** en el mismo wifi: ninguno debe recibir "Demasiadas fotos seguidas".
- [ ] Escanear el QR impreso con un Android y un iPhone.
- [ ] Mandar una foto a @FitoLensBot.
- [ ] **Build EAS del APK** (`eas build -p android --profile apk`) el 22–23 nov con los modelos reales.
- [ ] **Ensayo del Plan B**: `./fitolens.sh offline` en la laptop con el hotspot.
