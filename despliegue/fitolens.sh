#!/usr/bin/env bash
# FitoLens: el único comando de mantenimiento. Ejecutar ./fitolens.sh para ver la ayuda.
set -euo pipefail
cd "$(dirname "$0")"
REPO="sorprendete/FitoLens"
dc() { docker compose "$@"; }
env_get() { grep -E "^$1=" .env | cut -d= -f2- || true; }
env_set() { if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }

ayuda() { cat <<'EOF'
Uso: ./fitolens.sh <comando>

  estado               ¿Está todo funcionando? (contenedores, salud, disco)
  actualizar           Baja la última versión del código y las imágenes, y reinicia
  logs [servicio]      Ver los últimos mensajes (api, web, db, caddy, bot, backup)
  reiniciar [servicio] Reinicia un servicio o todo
  respaldar            Hace un respaldo de la base de datos ahora
  restaurar <archivo>  Restaura un respaldo de ../respaldos
  modelos [versión]    Descarga los modelos de IA del Release de GitHub y reinicia la API
  volver <versión>     Vuelve a una versión anterior de las imágenes (ej. 2026.11.23-1)
  instalar             Primera vez: crea .env con claves seguras, baja modelos y arranca
  offline              Plan B en laptop sin internet
EOF
}

estado() {
  dc ps --format 'table {{.Service}}\t{{.Status}}'
  echo; echo -n "API: "
  dc exec -T api python -c "import urllib.request;print(urllib.request.urlopen('http://localhost:8000/api/salud').read().decode())" 2>/dev/null || echo "NO RESPONDE"
  echo -n "Web pública: https://$(env_get DOMINIO) -> "
  curl -s -o /dev/null -w '%{http_code}\n' "https://$(env_get DOMINIO)/api/salud" || echo "sin respuesta"
  echo; df -h / | tail -1 | awk '{print "Disco usado: "$5" ("$4" libres)"}'
  echo "Último respaldo: $(ls -1t ../respaldos/*.sql.gz 2>/dev/null | head -1 || echo ninguno)"
}

modelos() {
  local v="${1:-$(env_get MODELOS_VERSION)}"
  local tmp; tmp="$(mktemp -d)"
  echo "Descargando modelos $v ..."
  curl -fL "https://github.com/$REPO/releases/download/$v/modelos.zip" -o "$tmp/modelos.zip"
  mkdir -p ../modelos.nuevo && unzip -oq "$tmp/modelos.zip" -d ../modelos.nuevo
  [ -d ../modelos ] && mv ../modelos "../modelos.anterior.$(date +%s)"
  mv ../modelos.nuevo ../modelos
  env_set MODELOS_VERSION "$v"
  rm -r "$tmp"
  dc restart api 2>/dev/null || true
  echo "Modelos $v instalados. (La carpeta anterior quedó como ../modelos.anterior.*)"
}

instalar() {
  if [ ! -f .env ]; then
    cp .env.example .env
    while grep -q "__GENERAR__" .env; do sed -i "0,/__GENERAR__/s//$(openssl rand -hex 24)/" .env; done
    read -rp "Dominio (o IP.sslip.io): " d; env_set DOMINIO "$d"
    read -rp "Correo (certificado HTTPS y usuario admin): " m; env_set ACME_EMAIL "$m"; env_set ADMIN_USUARIO "$m"
    echo ".env creado. Clave del admin: $(env_get ADMIN_CLAVE)  (guárdala)"
  fi
  mkdir -p ../respaldos
  [ -d ../modelos ] || modelos
  dc pull --ignore-buildable 2>/dev/null || dc pull
  dc up -d
  estado
}

case "${1:-}" in
  estado) estado ;;
  actualizar)
    git -C .. pull --ff-only
    dc pull --ignore-buildable 2>/dev/null || dc pull
    dc up -d --remove-orphans
    docker image prune -f >/dev/null
    estado ;;
  logs) dc logs --tail=100 -f ${2:-} ;;
  reiniciar) dc restart ${2:-} ;;
  respaldar) dc exec -T backup /bin/sh /respaldo.sh ahora ;;
  restaurar)
    f="${2:?Indica el archivo, ej: ./fitolens.sh restaurar ../respaldos/fitolens_2026-11-24_0300.sql.gz}"
    read -rp "Esto REEMPLAZA la base de datos actual con $f. ¿Seguro? (si/no) " r
    [ "$r" = "si" ] || exit 1
    dc exec -T backup /bin/sh /respaldo.sh ahora   # copia de seguridad antes de restaurar
    gunzip -c "$f" | dc exec -T db sh -c 'psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    dc restart api
    echo "Restaurado." ;;
  modelos) modelos "${2:-}" ;;
  volver)
    env_set VERSION "${2:?Indica la versión, ej: 2026.11.23-1}"
    dc pull && dc up -d
    echo "Ahora en la versión $2. Para volver a la última: ./fitolens.sh volver latest" ;;
  instalar) instalar ;;
  offline)
    [ -f .env ] || { cp .env.example .env; while grep -q "__GENERAR__" .env; do sed -i "0,/__GENERAR__/s//$(openssl rand -hex 24)/" .env; done; echo "Clave admin: $(env_get ADMIN_CLAVE)"; }
    CADDYFILE=Caddyfile.offline COMPOSE_PROFILES=offline dc up -d
    echo "Listo. Conecta los celulares a la misma red y abre: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo IP-DE-LA-LAPTOP)" ;;
  *) ayuda ;;
esac
