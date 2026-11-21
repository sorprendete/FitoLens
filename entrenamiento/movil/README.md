# Modelos para la app móvil

`cuantizar.py` toma la carpeta `modelos/` (contrato en `docs/contrato_modelos.md`), cuantiza cada modelo a INT8 y deja en la app:

- `app/assets/modelos/<nombre>.onnx` (router, hortalizas, cafe, cacao)
- `app/assets/modelos/modelos.json`: clases, entrada (alto/ancho), temperatura, umbral, sha256 y la comparación INT8 vs FP32.

```bash
pip install onnx onnxruntime pillow numpy sympy
python entrenamiento/movil/cuantizar.py --modelos modelos --fotos muestras --salida app/assets/modelos
```

- `--fotos`: 50–200 fotos de campo en `muestras/<id_clase>/` (ej. `muestras/cafe_roya/`). Sirven para calibrar (INT8 estático) y medir la pérdida. Sin fotos usa cuantización dinámica y solo mide coincidencia con datos aleatorios.
- Prueba INT8 dinámico (solo MatMul y completo) y estático QDQ; se queda con el más liviano que pierda ≤ `--max-perdida` (2 puntos, contando accuracy y desacuerdo con FP32). Si ninguno cumple, deja FP32. Requiere `sympy`.
- Resultado 20 nov 2026: hortalizas, café y cacao (ConvNeXt-Tiny) 106 → 27 MB con INT8 dinámico (pérdida 0–1,5 %). Router (EfficientNetV2-B2) queda en FP32, 33 MB: el INT8 estático perdía 5 puntos y el dinámico no ahorraba espacio. El estático QDQ arruina ConvNeXt (pierde 27–54 %).
- La app debe preprocesar igual que la API: enderezar EXIF, RGB, redimensión directa bilineal a alto×ancho, 0–1, NCHW. La normalización y el TTA van dentro del modelo.
