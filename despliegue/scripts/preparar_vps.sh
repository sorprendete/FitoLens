#!/usr/bin/env bash
# Se ejecuta UNA sola vez, como root, en un VPS Ubuntu 22.04/24.04 recién creado:
#   curl -fsSL https://raw.githubusercontent.com/sorprendete/FitoLens/main/despliegue/scripts/preparar_vps.sh | bash
# Deja: Docker, firewall (solo 22/80/443), fail2ban, actualizaciones de seguridad automáticas,
# el usuario "fitolens" y el repositorio en /opt/fitolens.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Ejecutar como root"; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -q && apt-get upgrade -yq
apt-get install -yq ca-certificates curl git unzip ufw fail2ban unattended-upgrades
timedatectl set-timezone America/Lima

# Docker oficial
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Firewall: solo SSH y web
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable

# Seguridad básica
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

# Usuario de trabajo (sin contraseña; entra con la misma llave SSH que root)
id fitolens >/dev/null 2>&1 || useradd -m -s /bin/bash -G docker fitolens
if [ -f /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o fitolens -g fitolens /home/fitolens/.ssh
  install -m 600 -o fitolens -g fitolens /root/.ssh/authorized_keys /home/fitolens/.ssh/authorized_keys
fi

# Código
[ -d /opt/fitolens/.git ] || git clone https://github.com/sorprendete/FitoLens.git /opt/fitolens
chown -R fitolens:fitolens /opt/fitolens
chmod +x /opt/fitolens/despliegue/fitolens.sh

echo
echo "VPS listo. Siguiente paso:"
echo "  su - fitolens"
echo "  cd /opt/fitolens/despliegue && ./fitolens.sh instalar"
