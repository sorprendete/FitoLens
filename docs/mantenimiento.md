# Mantenimiento de FitoLens

Todo se hace con **un solo comando** dentro del VPS:

```bash
ssh fitolens@IP-DEL-VPS
cd /opt/fitolens/despliegue
./fitolens.sh            # muestra la ayuda
```

## Lo del día a día

| Quiero… | Comando |
|---|---|
| Saber si todo funciona | `./fitolens.sh estado` |
| Ver errores de la API | `./fitolens.sh logs api` (salir con Ctrl+C) |
| Reiniciar algo que falla | `./fitolens.sh reiniciar api` (o sin nombre: todo) |
| Publicar cambios de código | Hacer `git push` a `main`. GitHub lo despliega solo en ~5 min |
| Actualizar a mano | `./fitolens.sh actualizar` |
| Volver a la versión anterior | `./fitolens.sh volver 2026.11.23-4` (las versiones están en GitHub > Packages) |

## Cambiar un modelo de IA

1. Subir `modelos.zip` (con las carpetas `router/`, `hortalizas/`, `cafe/`, `cacao/`) a un Release nuevo de GitHub, por ejemplo `modelos-v2`.
2. En el VPS: `./fitolens.sh modelos modelos-v2`

La carpeta anterior queda guardada como `modelos.anterior.*`. Para deshacer: `./fitolens.sh modelos modelos-v1`.
No se toca código: cada modelo trae su `manifest.json` con clases, umbral y versión.

## Respaldos

- Se hacen solos todos los días a las 3:00 a. m. (hora de Lima) en `/opt/fitolens/respaldos/`. Se guardan 14 días.
- Respaldo inmediato: `./fitolens.sh respaldar`
- Restaurar: `./fitolens.sh restaurar ../respaldos/fitolens_2026-11-24_0300.sql.gz`
- Recomendado una vez por semana: copiar la carpeta de respaldos a tu PC:
  `scp -r fitolens@IP-DEL-VPS:/opt/fitolens/respaldos ./respaldos-fitolens`

## Configuración

Solo existe un archivo: `despliegue/.env`. Después de cambiarlo: `./fitolens.sh reiniciar`.
Nunca se sube a GitHub.

## Instalación desde cero (VPS nuevo, ~10 min)

1. Como root en el VPS:
   `curl -fsSL https://raw.githubusercontent.com/sorprendete/FitoLens/main/despliegue/scripts/preparar_vps.sh | bash`
2. `su - fitolens`, luego `cd /opt/fitolens/despliegue && ./fitolens.sh instalar`
   (pide el dominio, crea las claves y arranca todo; el HTTPS se obtiene solo en 1 minuto).
3. En GitHub, una sola vez:
   - **Packages**: poner `fitolens-api`, `fitolens-web` y `fitolens-bot` como *Public* (así el VPS las descarga sin clave).
   - **Settings > Secrets > Actions**: `VPS_HOST` (IP), `VPS_USER` (`fitolens`), `VPS_SSH_KEY` (llave privada).
   - **Settings > Variables > Actions**: `DESPLIEGUE_ACTIVO` = `si`.

## Plan B: laptop sin internet (feria)

Requisito: Docker Desktop instalado y la laptop preparada **el día anterior con internet**:

```bash
git clone https://github.com/sorprendete/FitoLens.git && cd FitoLens/despliegue
./fitolens.sh modelos        # baja los modelos
docker compose pull          # baja las imágenes
```

El día de la feria, sin internet:

1. Activar el hotspot del celular (o un router) y conectar la laptop.
2. `./fitolens.sh offline`
3. Ver la IP de la laptop (`ipconfig` en Windows) y abrir en los celulares `http://ESA-IP`.
   Imprimir también el QR de respaldo `qr/qr_offline.png` con esa IP.

Sin HTTPS el navegador no deja abrir la cámara en vivo, pero el botón **“Tomar foto”** sí funciona
(abre la cámara del celular y sube la foto).

## Si algo sale mal

| Síntoma | Qué hacer |
|---|---|
| La web no abre | `./fitolens.sh estado`. Si un servicio no dice "Up": `./fitolens.sh reiniciar` |
| Error de certificado | Revisar que `DOMINIO` en `.env` apunte a la IP del VPS; `./fitolens.sh logs caddy` |
| Diagnósticos fallan | `./fitolens.sh logs api`; si es un modelo nuevo, volver al anterior con `./fitolens.sh modelos` |
| Disco lleno | `docker system prune -f` |
| Último despliegue rompió algo | `./fitolens.sh volver <versión anterior>` |
