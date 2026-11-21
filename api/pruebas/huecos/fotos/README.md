# Fotos de prueba para detección de huecos de gusano cogollero

Estructura de carpetas:
- `maiz_gusano_cogollero/*.jpg`: fotos de hojas con daño por mordedura (huecos internos claros).
- `maiz_tizon_hoja/*.jpg`: fotos de hojas con manchas o lesiones necróticas de tizón (sin huecos internos).
- `maiz_sana/*.jpg`: fotos de hojas sanas.

El script `api/pruebas/huecos/medir.py` recorre estas imágenes y mide la segmentación y huecos con y sin la regla.
Si esta carpeta no tiene fotos, `medir.py` genera automáticamente fotos de muestra sintéticas para verificar la lógica.
