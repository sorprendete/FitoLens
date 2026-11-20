# Instalar FitoLens en tu VPS (paso a paso)

- VPS: Contabo Cloud VPS 6 · IP **5.253.232.122**
- Dirección pública (sin dominio): **https://5.253.232.122.sslip.io**
- Antes de empezar: el código ya debe estar subido a https://github.com/sorprendete/FitoLens
  y el repositorio debe ser **público** (no contiene claves; las claves viven solo en el VPS).

## Paso 1. Preparar el VPS (una sola vez, ~5 min)

Desde tu PC (PowerShell o Git Bash):

```bash
ssh root@5.253.232.122
```

Ya dentro del VPS, pega esta línea:

```bash
curl -fsSL https://raw.githubusercontent.com/sorprendete/FitoLens/main/despliegue/scripts/preparar_vps.sh | bash
```

Instala Docker, el firewall, fail2ban y deja el código en `/opt/fitolens`.

## Paso 2. Arrancar FitoLens (~3 min)

```bash
su - fitolens
cd /opt/fitolens/despliegue
./fitolens.sh instalar
```

Te pregunta dos cosas:
- **Dominio**: escribe `5.253.232.122.sslip.io`
- **Correo**: tu correo (sirve para el certificado HTTPS y como usuario admin)

Al final muestra la **clave del admin**: guárdala. Abre https://5.253.232.122.sslip.io en el celular.

## Paso 3. Despliegue automático desde GitHub (una sola vez)

Así, cada `git push` a `main` actualiza el VPS solo.

**3a. Crear la llave para GitHub** (en el VPS, como `fitolens`):

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/github_actions
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_actions          # copia TODO lo que sale, incluidas las líneas BEGIN/END
```

**3b. Secretos** → https://github.com/sorprendete/FitoLens/settings/secrets/actions → *New repository secret*:

| Nombre | Valor |
|---|---|
| `VPS_HOST` | `5.253.232.122` |
| `VPS_USER` | `fitolens` |
| `VPS_SSH_KEY` | lo que copiaste en 3a |

**3c. Variable** → https://github.com/sorprendete/FitoLens/settings/variables/actions → *New repository variable*:
`DESPLIEGUE_ACTIVO` = `si`

**3d. Imágenes públicas** (después del primer push, cuando GitHub Actions termine en verde):
entra a https://github.com/sorprendete?tab=packages, abre `fitolens-api`, `fitolens-web` y `fitolens-bot`,
y en cada una: *Package settings* → *Change visibility* → **Public**.

**3e. Probar**: https://github.com/sorprendete/FitoLens/actions → *Desplegar* → *Run workflow*.

## Paso 4. QR del stand

Ya está generado: `despliegue/qr/qr_stand.png` (apunta a https://5.253.232.122.sslip.io). Imprímelo en A4 o A5.

## Si algo falla

`./fitolens.sh estado` y `./fitolens.sh logs api`. El resto está en `docs/mantenimiento.md`.
