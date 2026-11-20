# Modelos para la app móvil

`cuantizar.py` toma la carpeta `modelos/` (contrato en `docs/contrato_modelos.md`), cuantiza cada modelo a INT8 y deja en la app:

- `app/assets/modelos/<nombre>.onnx` (router, hortalizas, cafe, cacao)
- `app/assets/modelos/modelos.json`: clases, entrada (alto/ancho), temperatura, umbral, sha256 y la comparación INT8 vs FP32.

```bash
pip install onnx onnxruntime pillow numpy
python entrenamiento/movil/cuantizar.py --modelos modelos --fotos muestras --salida app/assets/modelos
```

- `--fotos`: 50–200 fotos de campo en `muestras/<id_clase>/` (ej. `muestras/cafe_roya/`). Sirven para calibrar (INT8 estático) y medir la pérdida. Sin fotos usa cuantización dinámica y solo mide coincidencia con datos aleatorios.
- Si un modelo pierde más de `--max-perdida` (2 puntos por defecto), se deja en FP32.
- La app debe preprocesar igual que la API: enderezar EXIF, RGB, redimensión directa bilineal a alto×ancho, 0–1, NCHW. La normalización y el TTA van dentro del modelo.
