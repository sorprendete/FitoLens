# Bot de Telegram de FitoLens

El agricultor manda una foto y recibe: la enfermedad (o "planta sana"), la confianza, la urgencia,
el consejo de manejo y el mapa de calor. El bot **no tiene IA**: llama a `POST /api/diagnostico`
de la API con `origen=bot`.

## Archivos

| Archivo | Qué hay | Cuándo tocarlo |
|---|---|---|
| `app/textos.py` | Todos los mensajes al agricultor | Cambiar una frase |
| `app/consejos.py` | Nombre, causa y consejo por clase (copia de `web/src/datos/clases.js`) | Nueva enfermedad o modelo nuevo |
| `app/cliente_api.py` | Llamada a la API y errores en español | Si cambia la API |
| `app/main.py` | Comandos y flujo de la foto | Nuevo comando |
| `app/config.py` | Variables de entorno | Nueva opción |

Un test comprueba que `consejos.py` y la web tengan las mismas clases: si agregas una en un lado, agrégala en el otro.

## Configuración (en `despliegue/.env`)

- `TELEGRAM_TOKEN`: el que da @BotFather.
- `COMPOSE_PROFILES=online,bot`: activa el contenedor del bot.
- `DOMINIO`: si está puesto, el bot usa **webhook** en `https://DOMINIO/bot/telegram` (Caddy lo envía al puerto 8080).
  Sin dominio (modo offline) usa **polling**, que solo necesita salida a internet. Se puede forzar con `BOT_MODO=webhook|polling`.

El webhook lleva un secreto derivado del token: nadie más puede mandarle mensajes falsos al bot.
El límite de fotos por minuto de la API se aplica por agricultor (el bot envía `X-Forwarded-For: telegram-<id>`).

## Comandos del bot

`/start` y `/ayuda` (consejos para una buena foto) · `/provincia` (para el mapa de brotes; se pregunta una vez tras la primera foto).

## Pruebas

```bash
pip install -r requirements-dev.txt && pytest -q
```

Ver lo que pasa en el VPS: `./fitolens.sh logs bot`.
