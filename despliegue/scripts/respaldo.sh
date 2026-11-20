#!/bin/sh
# Respaldo de PostgreSQL. Corre dentro del contenedor "backup".
#   respaldo.sh bucle  -> un respaldo diario a la hora RESPALDO_HORA, borra los de más de RESPALDO_DIAS
#   respaldo.sh ahora  -> un respaldo inmediato
set -eu
DIAS="${RESPALDO_DIAS:-14}"
HORA="${RESPALDO_HORA:-03}"

respaldar() {
  archivo="/respaldos/fitolens_$(date +%Y-%m-%d_%H%M).sql.gz"
  pg_dump --no-owner --clean --if-exists | gzip > "$archivo.tmp"
  mv "$archivo.tmp" "$archivo"
  find /respaldos -name 'fitolens_*.sql.gz' -mtime +"$DIAS" -delete
  echo "$(date '+%F %T') respaldo listo: $archivo ($(du -h "$archivo" | cut -f1))"
}

case "${1:-ahora}" in
  ahora) respaldar ;;
  bucle)
    echo "Respaldo diario a las ${HORA}:00, se guardan ${DIAS} días."
    while true; do
      [ "$(date +%H)" = "$HORA" ] && respaldar && sleep 3600
      sleep 300
    done ;;
esac
