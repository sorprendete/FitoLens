# Contrato de modelos (acordado entre entrenamiento y API)

Cambiar un modelo = reemplazar su carpeta y reiniciar la API (`docker compose restart api`). Sin tocar código.

```
modelos/
├─ router/       model.onnx · manifest.json · metricas.json
├─ hortalizas/   (pimiento, papa, tomate)
├─ cafe/
└─ cacao/
```

## model.onnx

- Entrada `imagen`: `float32 [N, 3, H, W]`, RGB, rango 0–1, N dinámico. La normalización (ImageNet) va **dentro** del grafo.
- Redimensión directa a H×W, bilineal, sin recorte (`PIL.Image.resize((W, H), Image.BILINEAR)`). Usa la misma función al evaluar en campo.
- Salidas:
  - `logits` `[N, K]`: el TTA (original + espejo) ya va promediado dentro del grafo.
  - `cam` `[N, K, h, w]`: mapa por clase sin normalizar. La API toma `cam[clase]`, aplica ReLU, min-max y lo escala a la foto.

## manifest.json

```json
{
  "nombre": "cafe",
  "version": "1.0.0",
  "tipo": "especialista",
  "backbone": "efficientnetv2-b2",
  "clases": [
    {"id": "cafe_sana", "nombre": "sana", "etiqueta": "Hoja sana", "cultivo": "cafe", "sana": true},
    {"id": "cafe_roya", "nombre": "roya", "etiqueta": "Roya del café", "cultivo": "cafe", "sana": false}
  ],
  "entrada": {"alto": 260, "ancho": 260, "formato": "RGB", "rango": [0, 1], "redimension": "directa"},
  "salidas": {"logits": "logits", "cam": "cam"},
  "temperatura": 1.0,
  "umbral": 0.6,
  "sha256": "<sha256 de model.onnx>",
  "entrenado": {"fecha": "2026-11-21", "datasets": ["Mendeley 10.17632/mfpxg4y65r.2"]}
}
```

- `id` de clase: snake_case en español con prefijo de cultivo. `sana` opcional: si falta, es sana cuando el id termina en `_sana`.
- La API aplica `softmax(logits / temperatura)`. Si la confianza < `umbral` → `no_concluyente`.
- En especialistas de varios cultivos (hortalizas), la API se queda solo con las clases del cultivo que eligió el router y renormaliza (softmax solo sobre esas).
- `sha256`: la API se niega a cargar un modelo cuyo hash no coincide.

### Router

Clases: `pimiento, papa, tomate, cafe, cacao, otra_planta, no_planta`. Campos opcionales (estos son los valores por defecto):

```json
"rechazo": ["otra_planta", "no_planta"],
"especialistas": {"pimiento": "hortalizas", "papa": "hortalizas", "tomate": "hortalizas", "cafe": "cafe", "cacao": "cacao"}
```

## metricas.json

La API lo devuelve en `GET /api/metricas` junto con datos del manifest.

```json
{
  "campo": {"accuracy": 0.0, "f1_macro": 0.0, "n": 0, "matriz_confusion": [[0]]},
  "laboratorio": {"accuracy": 0.0},
  "latencia_ms": 0
}
```

Ejemplos válidos: `python api/scripts/crear_modelos_falsos.py modelos/`.
