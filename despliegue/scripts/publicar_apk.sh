#!/usr/bin/env bash
# Publica el APK de la app móvil en https://<sitio>/descargas/FitoLens.apk
# y escribe descargas/app.json, que la página "App móvil" de la web lee para mostrar versión y tamaño.
# La app instalada lee ese mismo app.json: si la versión es mayor que la suya, muestra "Actualizar".
# Por eso, antes de compilar un APK nuevo, sube "version" en app/app.json (ej. 2.0.0 → 2.0.1).
# Uso (en el VPS, dentro de /opt/fitolens/despliegue):  scripts/publicar_apk.sh archivo.apk [versión] ["qué cambió"]
set -euo pipefail
cd "$(dirname "$0")/.."
APK="${1:?Uso: scripts/publicar_apk.sh archivo.apk [versión] [notas]}"
NOTAS="${3:-}"
VERSION="${2:-$(grep -o '"version": *"[^"]*"' ../app/app.json 2>/dev/null | head -1 | cut -d'"' -f4)}"
[ -f "$APK" ] || { echo "No existe: $APK"; exit 1; }
mkdir -p descargas
cp "$APK" descargas/FitoLens.apk.tmp && mv descargas/FitoLens.apk.tmp descargas/FitoLens.apk
MB=$(awk "BEGIN{printf \"%.1f\", $(stat -c %s descargas/FitoLens.apk)/1048576}")
SHA=$(sha256sum descargas/FitoLens.apk | cut -d' ' -f1)
python3 -c 'import json,sys; print(json.dumps(dict(zip(["version","tamano_mb","fecha","sha256","notas"], sys.argv[1:2]+[float(sys.argv[2])]+sys.argv[3:])), ensure_ascii=False))' \
  "${VERSION:-1.0}" "$MB" "$(date +%d/%m/%Y)" "$SHA" "$NOTAS" > descargas/app.json.tmp && mv descargas/app.json.tmp descargas/app.json
chmod 644 descargas/FitoLens.apk descargas/app.json
echo "Publicado: descargas/FitoLens.apk ($MB MB, versión ${VERSION:-1.0})"
echo "Si es la primera vez, recrea Caddy para montar la carpeta:  docker compose up -d caddy"
