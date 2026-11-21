# Auditoría de Seguridad - FitoLens

Fecha: 21 de noviembre de 2026  
Objetivo: Auditoría defensiva integral de código fuente, configuración y flujo de datos en `api/`, `web/src/`, `bot/`, `despliegue/` y `app/`.

---

## 1. Resumen Ejecutivo

Se realizó una auditoría completa de seguridad sobre los componentes del sistema FitoLens. El núcleo de la API (`api/`) y el bot de Telegram (`bot/`) presentan buenas bases de seguridad (contraseñas con bcrypt, consultas parametrizadas con SQLAlchemy ORM, verificación de integridad SHA-256 en modelos ONNX, aislamiento multi-inquilino de parcelas e historial, y ausencia de credenciales embebidas).

Se identificaron y corrigieron oportunamente vulnerabilidades relacionadas con:
- Ausencia de cabeceras de seguridad HTTP en la API.
- Fallo no controlado (error 500) en el análisis de tokens JWT manipulados (`sub`/`dis` no enteros o ausentes).
- Ausencia de límite superior (72 bytes) en contraseñas para bcrypt (riesgo de bypass por truncamiento o denegación de servicio/crashes).
- Falta de limitación de tasa (*rate limiting*) en endpoints críticos como `POST /api/auth/registro` y `POST /api/sincronizar`.
- Potencial fuga de rutas absolutas del servidor en `/api/salud` ante errores de carga de modelos.
- Descarga descontrolada de archivos y falta de validación de tamaño real/contenido en el bot de Telegram.

Adicionalmente, se documentaron riesgos en la infraestructura de despliegue (`despliegue/`) y la aplicación móvil (`app/`), manteniéndolos intactos según las restricciones de la tarea.

---

## 2. Hallazgos y Correcciones en Componentes Auditados

### 2.1 Autenticación y Tokens JWT
- **Hallazgo:** El algoritmo `HS256` está fijado y el secreto `JWT_SECRETO` es obligatorio desde el entorno (validado con `Field(min_length=32)`). La expiración se calcula adecuadamente (720 min para web, 90 días para app). Sin embargo, en `usuario_opcional` (`api/app/rutas/dependencias.py`), la conversión `int(datos["sub"])` y `int(datos["dis"])` asumía tipos enteros válidos sin capturar excepciones.
- **Riesgo:** Si un token malicioso o alterado contenía un campo `sub` o `dis` no numérico o ausente, la API arrojaba un error 500 no controlado (*Unhandled Exception*) en lugar de rechazar con 401.
- **Corrección:** Se implementó bloque `try/except (ValueError, TypeError, KeyError)` en `usuario_opcional` retornando `HTTPException(401, "Sesión inválida o vencida.")` de manera consistente.

### 2.2 Hash de Contraseñas y Límite Bcrypt
- **Hallazgo:** Las contraseñas se almacenan mediante `bcrypt.hashpw` con salt dinámico (`gensalt()`). Sin embargo, los esquemas `Login` y `Registro` permitían `max_length=200`, superando el límite nativo de 72 bytes de bcrypt.
- **Riesgo:** Contraseñas mayores a 72 bytes son truncadas silenciosamente o provocan `ValueError` no capturado en librerías modernas de bcrypt, causando errores 500 o permitiendo colisiones lógicas donde dos contraseñas idénticas en sus primeros 72 caracteres se autentican igual.
- **Corrección:** Se redujo `max_length=72` en los esquemas `Login` y `Registro` en `api/app/esquemas.py`, y se añadió validación defensiva en `hashear()` y `verificar()` en `api/app/seguridad/claves.py`.

### 2.3 Límites de Tasa (Rate Limiting) y Protección contra Fuerza Bruta
- **Hallazgo:** El inicio de sesión (`/api/auth/login`) cuenta con protección robusta contra fuerza bruta por correo (5 fallos) y por IP (20 fallos) durante 15 minutos en `Auditoria`. Los endpoints de `/api/diagnostico` y `/api/reporte/{id}` cuentan con `LimitadorPorIP`. Sin embargo, `POST /api/auth/registro` y `POST /api/sincronizar` carecían de limitador.
- **Riesgo:** Ataques de denegación de servicio por agotamiento de almacenamiento o enumeración de correos en registro (`409 Ese correo ya tiene cuenta`), y saturación de la base de datos/disco en sincronización offline.
- **Corrección:** Se integró `limitador.permitir(f"registro:{ip}", 10)` en `/api/auth/registro` (registrando bloqueos en auditoría) y `limitador.permitir(f"sincronizar:{usuario.id}", 120)` en `/api/sincronizar`.

### 2.4 Cabeceras de Seguridad HTTP y Manejo Global de Errores
- **Hallazgo:** La API no inyectaba cabeceras de seguridad HTTP básicas ni contaba con un manejador para excepciones internas no controladas a nivel de aplicación.
- **Riesgo:** Exposición a ataques de *clickjacking*, *MIME-sniffing* o fugas de trazas internas (*stack traces*) si se accede a la API directamente o a través de entornos donde el proxy inverso no inyecta cabeceras.
- **Corrección:** Se agregó middleware HTTP en `api/app/main.py` inyectando:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-XSS-Protection: 1; mode=block`  
  Se añadió un manejador global de excepciones para errores 500 que registra la traza internamente en el log y retorna únicamente `{"detail": "Error interno del servidor."}`.

### 2.5 Validación de Entradas y Subida de Archivos
- **Hallazgo:** La validación de imágenes en la API (`api/app/ia/imagen.py`) es ejemplar: valida tamaño en bytes (`8 MB`), comprueba *magic bytes* reales (JPEG, PNG, WebP), aplica límite de píxeles contra *decompression bombs* (`DecompressionBombWarning`) y valida la decodificación con Pillow.
- **Riesgo:** Sin embargo, en el bot de Telegram (`bot/app/main.py`), si Telegram no proveía `file_size` en la cabecera del mensaje, se descargaba el archivo completo en memoria sin verificar su tamaño final ni validar si venía vacío.
- **Corrección:** Se reforzó `bot/app/main.py` para validar `len(datos) == 0` y `len(datos) > MAX_BYTES` inmediatamente después de la descarga, antes de remitir la petición a la API.

### 2.6 Prevención de Fugas de Datos e IDOR (Insecure Direct Object References)
- **Hallazgo:**
  - **Parcelas:** Cada operación (`GET`, `PUT`, `DELETE`, `POST visitas`, `DELETE visitas`) verifica la pertenencia mediante `_propia()` (`p.usuario_id == usuario.id`). Además, enlazar un diagnóstico a una visita verifica explícitamente `d.usuario_id == p.usuario_id`.
  - **Historial:** `GET /api/historial` filtra estrictamente por `usuario_id` del usuario autenticado; solo el rol `admin` puede consultar el historial global.
  - **Reportes PDF:** El endpoint `POST /api/reporte/{diagnostico_id}` requiere enviar la misma foto original comparando su huella `SHA-256` con `d.imagen_sha256`, imposibilitando la enumeración o descarga no autorizada de reportes ajenos.
  - **Sincronización:** Si un `id_cliente` ya existe en la base de datos, se valida que pertenezca al mismo `usuario.id`, rechazando con 409 si pertenece a otro usuario.
  - **Dispositivos:** Revocar un dispositivo valida que `d.usuario_id == usuario.id`.

### 2.7 Inyección SQL
- **Hallazgo:** Todo el acceso a datos en la API utiliza SQLAlchemy ORM (`select()`, `session.get()`, `func.count()`) con parámetros ligados (*bound parameters*). La única sentencia cruda es `text("SELECT 1")` en el health check de base de datos.
- **Riesgo:** Ninguno identificado en la API. No existen concatenaciones de cadenas en sentencias SQL.

### 2.8 Fuga de Información en `/api/salud`
- **Hallazgo:** En `api/app/rutas/salud.py`, el diccionario `"errores_modelos"` devolvía directamente `registro.errores`, el cual contenía `str(e)` de las excepciones producidas durante la inicialización de modelos.
- **Riesgo:** Posible fuga de rutas absolutas del servidor (`C:\...` o `/modelos/...`), versiones de librerías o nombres de módulos internos a clientes no autenticados.
- **Corrección:** Se sanitizó la salida de `/api/salud` para mapear los errores a `"Error de inicialización"`, conservando la clave del modelo sin exponer rutas del sistema.

### 2.9 Secretos en el Código y CORS
- **Hallazgo:** No existen secretos ni tokens de producción en el código de `api/`, `bot/` o `web/`. Todas las credenciales sensibles provienen de variables de entorno.
- **CORS:** La API por defecto tiene `cors_origenes=""` (lista vacía), lo que deshabilita el middleware CORS cuando se usa el mismo dominio detrás del proxy inverso de Caddy. En desarrollo, Vite utiliza proxy inverso interno (`/api` -> `http://localhost:8000`).

---

## 3. Lista de Riesgos Identificados (Sin Editar)

### 3.1 Despliegue (`despliegue/`)
1. **Ejecución de contenedores como root:** En `docker-compose.yml`, los servicios (`api`, `web`, `db`, `bot`, `caddy`, `backup`) no especifican directiva `user:`, ejecutándose con privilegios de root dentro del contenedor.
2. **Inyección indiscriminada de variables de entorno (`x-comun`):** Todos los servicios heredan `env_file: .env`, lo que expone credenciales de la base de datos y secretos JWT a contenedores como `web` o `caddy` que no los requieren.
3. **Ausencia de directiva `trusted_proxies` en Caddyfile:** Caddy utiliza `header_up X-Real-IP {client_ip}`. Si el servidor se coloca detrás de una CDN (ej. Cloudflare), `{client_ip}` reflejará la IP de la CDN, afectando el bloqueo por IP de fuerza bruta.
4. **Respaldos sin cifrado en reposo:** El script `respaldo.sh` genera volcados `.sql.gz` en claro dentro de `../respaldos`. Si el volumen o disco es comprometido, los datos quedan expuestos.
5. **Límites de memoria ausentes en contenedores secundarios:** Solo `api` define límites de memoria (6 GB); la base de datos `db` y los demás servicios carecen de límites de memoria y CPU, facilitando ataques de denegación de servicio por consumo de recursos.

### 3.2 App Móvil (`app/`)
1. **Dominio de fallback hardcodeado en `servidor.ts`:** Se define una URL por defecto con servicio dinámico sslip.io (`https://fitolens.5-253-232-122.sslip.io`).
2. **Base de datos SQLite local sin cifrar:** `fitolens.db` almacena diagnósticos, fotos locales, coordenadas GPS e historial de parcelas en texto claro en el almacenamiento del dispositivo.
3. **Ausencia de SSL Certificate Pinning:** Las conexiones fetch no implementan fijación de certificados SSL, siendo susceptibles a intercepciones en redes Wi-Fi públicas con certificados CA maliciosos.
4. **Metadatos EXIF en fotos enviadas:** Al enviar fotos a través de la app, se deberían eliminar metadatos EXIF sensibles (como números de serie del sensor o metadatos de cámara) antes de la transmisión.

---

## 4. Pruebas Automatizadas Añadidas

Se creó el archivo de pruebas `api/tests/test_seguridad_extra.py` con cobertura para:
- Presencia y valores correctos de cabeceras HTTP de seguridad (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-XSS-Protection`).
- Manejo defensivo de tokens JWT con claim `sub` no numérico o ausente (retorna 401 en lugar de 500).
- Manejo defensivo de tokens con claim `dis` no numérico (retorna 401).
- Rechazo en validación (422) de contraseñas superiores a 72 bytes en login y registro.
- Limitación de tasa en `POST /api/auth/registro` (retorna 429 al superar 10 solicitudes/minuto).
- Sanitización de rutas del sistema de archivos en `/api/salud`.
