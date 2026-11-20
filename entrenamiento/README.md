# Entrenamiento de los modelos de FitoLens

Se entrena en Kaggle (GPU gratuita) y el VPS solo ejecuta los `.onnx` en CPU.

## Modelos

| Carpeta | Qué decide | Clases |
|---|---|---|
| `router` | qué cultivo es, o si se rechaza | pimiento, papa, tomate, cafe, cacao, otra_planta, no_planta |
| `hortalizas` | enfermedad de pimiento, papa y tomate | 15 (la API solo mira las del cultivo que dijo el router) |
| `cafe` | enfermedad de la hoja de café | cafe_sana, cafe_roya, cafe_ojo_de_gallo |
| `cacao` | enfermedad de la mazorca de cacao | cacao_sana, cacao_monilia, cacao_mazorca_negra |

Cada uno sale como `model.onnx` + `manifest.json` + `metricas.json` (contrato en `docs/contrato_modelos.md`).

## Cómo entrenar (Ronald, unos 10 minutos de clics)

1. Entra a kaggle.com con tu cuenta verificada por teléfono (sin eso no hay GPU ni Internet).
2. **Create → New Notebook → File → Import Notebook** y sube `notebooks/fitolens_todos.ipynb`
   (o uno por modelo: `fitolens_router.ipynb`, `fitolens_hortalizas.ipynb`, etc.).
3. Panel derecho → *Settings*: **Accelerator = GPU T4 x2** (o P100) e **Internet = On**.
4. Por si la descarga automática falla, en *Add Input* agrega estos datasets de Kaggle:
   `abdallahalidev/plantvillage-dataset`, `serranosebas/enfermedades-cacao-yolov4`, `prasunroy/natural-images`.
5. **Save Version → Save & Run All (Commit)**. Corre solo, aunque cierres la pestaña.
   Tiempo estimado: `todos` unas 5 a 7 h; café o cacao solos menos de 1 h (sin contar la descarga).
6. Al terminar, en **Output** descarga los `salida/modelo_<nombre>.zip` y únelos:
   `python entrenamiento/empaquetar_modelos.py modelo_router.zip modelo_hortalizas.zip modelo_cafe.zip modelo_cacao.zip`
   Sube el `modelos.zip` al Release `modelos-vN` de GitHub (ver `docs/mantenimiento.md`).

Lo primero que imprime cada corrida es la tabla *carpeta → etiqueta* y las fotos por clase y partición:
si una clase sale con 0 fotos, la regla de `reglas.py` no reconoció el nombre de la carpeta.

## Qué hace (receta orientada a campo)

- **Datos**: laboratorio (PlantVillage) y campo (PlantDoc, papa de Indonesia, café de Saposoa, cacao de Colombia...).
  Lista, licencias y citas en `docs/datos.md`.
- **Partición honesta**: validación y prueba son **solo fotos de campo**. Las fotos casi iguales (mismo hash
  perceptual) caen siempre en la misma partición. La prueba no se usa para elegir nada.
- **Aumentos de campo**: recorte aleatorio, giro, luz y color, desenfoque, compresión JPEG, borrado parcial
  y **cambio del fondo** de las fotos de laboratorio por fondos de fotos de campo.
- **Muestreo**: clases balanceadas y las fotos de campo salen 3 veces más.
- **Entrenamiento**: 2 épocas solo de cabeza y luego ajuste fino completo (AdamW, coseno, label smoothing,
  precisión mixta), con parada temprana por F1 macro en validación de campo.
- **Backbones**: ConvNeXt-Tiny y EfficientNetV2-B2. Se queda el de mejor F1 en validación que corra en menos
  de 300 ms en CPU (medido con ONNX Runtime).
- **Calibración**: temperatura ajustada en validación. **Umbral**: el menor que logra que acierte el 90 % de las
  veces que responde (en validación). Por debajo, la API responde "no concluyente".
- **Exportación**: ONNX con la normalización, el espejo (TTA) y el mapa de calor (CAM) dentro del grafo.
  Se comprueba que el ONNX dé lo mismo que PyTorch.
- **Informe** (`metricas.json`): accuracy con intervalo de confianza del 95 %, F1 macro, por clase, matriz de
  confusión, cobertura con umbral y calibración (ECE), todo sobre la prueba de campo.

## Mantenimiento

- Cambiar clases, datasets o hiperparámetros: `fitolens_ent/catalogo.py` (y `reglas.py` para nombres de carpeta).
- Después de cualquier cambio: `python entrenamiento/construir_notebooks.py` regenera los notebooks.
- Probar el pipeline sin GPU ni descargas: `cd entrenamiento && python -m fitolens_ent.entrenar --modelo cafe --prueba --trabajo /tmp/f --salida /tmp/s`
