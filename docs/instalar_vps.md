# Instalar FitoLens en tu VPS (paso a paso)

- VPS: Contabo Cloud VPS 6 · IP **5.253.232.122** (Ubuntu 24.04)
- Dirección pública: **https://fitolens.5-253-232-122.sslip.io**
- El VPS es **compartido**: el nginx del servidor ya atiende otros proyectos (cuida, dashboard, unsm)
  en los puertos 80/443. FitoLens vive aparte en `/opt/fitolens`, con su usuario `fitolens`,
  y nginx le pasa el tráfico a Caddy en `127.0.0.1:8088`. No toca los otros sitios.
- El repositorio https://github.com/sorprendete/FitoLens debe ser **público** (no contiene claves;
  las claves viven solo en `despliegue/.env`, en tu PC y en el VPS).

## Paso 1. Preparar el VPS (una sola vez, ~5 min)

Desde tu PC (PowerShell o Git Bash):

```bash
ssh root@5.253.232.122
```

Ya dentro del VPS, pega esta línea:

```bash
curl -fsSL https://raw.githubusercontent.com/sorprendete/FitoLens/main/despliegue/scripts/preparar_vps.sh | bash
```

Instala Docker, fail2ban, deja el firewall con 22/80/443 abiertos y el código en `/opt/fitolens`.

## Paso 2. Configuración (.env y modo nginx)

Desde tu PC, copia el `.env` (tiene las claves, el token del bot y tu correo):

```bash
scp D:\laragon\www\FitoLens\despliegue\.env fitolens@5.253.232.122:/opt/fitolens/despliegue/.env
```

En el VPS, como `fitolens`, crea el archivo que deja libres los puertos 80/443
(no se sube a GitHub):

```bash
cat > /opt/fitolens/despliegue/docker-compose.override.yml <<'EOF'
services:
  caddy:
    ports: !override
      - "127.0.0.1:8088:80"
EOF
```

El `.env` debe tener `DOMINIO=fitolens.5-253-232-122.sslip.io` y `CADDYFILE=Caddyfile.nginx`.

## Paso 3. Arrancar FitoLens (~5 min, construye las imágenes)

```bash
su - fitolens
cd /opt/fitolens/despliegue
./fitolens.sh instalar
```

Si todavía no existe el Release `modelos-v1` con los modelos entrenados, crea antes modelos de prueba:

```bash
mkdir -p /opt/fitolens/modelos
docker run --rm -v /opt/fitolens/api/scripts:/s:ro -v /opt/fitolens/modelos:/m python:3.12-slim \
  sh -c 'pip install -q numpy onnx && python /s/crear_modelos_falsos.py /m'
```

La clave del admin está en la línea `ADMIN_CLAVE=` del `.env`; el usuario es tu correo.

## Paso 4. Publicar con nginx y HTTPS (como root)

```bash
cp /opt/fitolens/despliegue/nginx-fitolens.conf /etc/nginx/sites-available/fitolens
ln -sf /etc/nginx/sites-available/fitolens /etc/nginx/sites-enabled/fitolens
nginx -t && systemctl reload nginx
certbot --nginx -d fitolens.5-253-232-122.sslip.io --redirect
```

Abre https://fitolens.5-253-232-122.sslip.io en el celular. Comprueba que tus otros sitios siguen respondiendo.

## Paso 5. Despliegue automático desde GitHub (opcional, una sola vez)

Así, cada `git push` a `main` actualiza el VPS solo.

**5a. Crear la llave para GitHub** (en el VPS, como `fitolens`):

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/github_actions
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_actions          # copia TODO lo que sale, incluidas las líneas BEGIN/END
```

**5b. Secretos** → https://github.com/sorprendete/FitoLens/settings/secrets/actions → *New repository secret*:

| Nombre | Valor |
|---|---|
| `VPS_HOST` | `5.253.232.122` |
| `VPS_USER` | `fitolens` |
| `VPS_SSH_KEY` | lo que copiaste en 5a |

**5c. Variable** → https://github.com/sorprendete/FitoLens/settings/variables/actions → *New repository variable*:
`DESPLIEGUE_ACTIVO` = `si`

**5d. Imágenes públicas** (después del primer push, cuando GitHub Actions termine en verde):
entra a https://github.com/sorprendete?tab=packages, abre `fitolens-api`, `fitolens-web` y `fitolens-bot`,
y en cada una: *Package settings* → *Change visibility* → **Public**.

**5e. Probar**: https://github.com/sorprendete/FitoLens/actions → *Desplegar* → *Run workflow*.

## Paso 6. QR del stand

Ya está generado: `despliegue/qr/qr_stand.png` (apunta a https://fitolens.5-253-232-122.sslip.io). Imprímelo en A4 o A5.
Para otra dirección: `python despliegue/scripts/generar_qr.py https://nueva.direccion despliegue/qr/qr_stand.png`.

## Si algo falla

`./fitolens.sh estado` y `./fitolens.sh logs api`. El resto está en `docs/mantenimiento.md`.
