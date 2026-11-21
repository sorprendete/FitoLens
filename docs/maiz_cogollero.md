# Diagnóstico y Corrección: Confusión entre Gusano Cogollero y Tizón de la Hoja en Maíz

**Fecha:** 20 de noviembre de 2026  
**Proyecto:** FitoLens — Entrenamiento del modelo especialista de maíz (`maiz`)

---

## 1. Resumen del Problema y Estado del Repositorio

Se reportó el siguiente fallo de inferencia en campo:
> **Caso reportado:** Una hoja de maíz con huecos irregulares y aserrín granular en la lámina foliar (daño característico causado por el gusano cogollero, *Spodoptera frugiperda*, clase `maiz_gusano_cogollero`) fue clasificada por el sistema como tizón de la hoja (*Exserohilum turcicum*, clase `maiz_tizon_hoja`) con **98 % de confianza calibrada**, y el mapa de calor (CAM) destacó una zona foliar sana sin ninguna lesión.

### Verificación de archivos en el repositorio
Al revisar el repositorio local se constató:
- `modelos/maiz/manifest.json` y `modelos/maiz/metricas.json`: **No existen en el repositorio**. El repositorio FitoLens versiona el código fuente y las herramientas de entrenamiento, mientras que los binarios `.onnx` y sus manifiestos se generan en Kaggle y se distribuyen empaquetados en los Releases de GitHub (`modelos-vN`) para su descarga en el VPS.
- `entrenamiento/notebooks/fitolens_maiz.ipynb`: No existía de forma independiente; los notebooks consolidados previos cubrían `router`, `hortalizas`, `cafe` y `cacao`.

---

## 2. Causas Profundas de la Confusión

El error se debe a una combinación de asimetría en los datos de entrenamiento, morfología de las imágenes, aumentos destructivos y la dinámica de activación de la red.

### A. Origen y desbalance extremo de los datasets (`catalogo.py` / `datos.py` / `docs/datos.md`)
1. **Tizón de la hoja (`maiz_tizon_hoja`)**:
   - Procede de fuentes públicas masivas: **PlantVillage** (miles de hojas en laboratorio con fondo monocromático), **PlantDoc** (fotos web de campo) y el dataset **maiz_bd** (Mendeley `10.17632/sb4wwjs8bz.1`, Bangladesh).
   - Cuenta con miles de imágenes disponibles (> 3,500 fotos), abarcando múltiples estadios de necrosis.
2. **Gusano cogollero (`maiz_gusano_cogollero`)**:
   - Ausente en PlantVillage y PlantDoc.
   - Procede únicamente de fuentes muy específicas y reducidas: **maiz_mld** (Mendeley `10.17632/3myfctrgk3.1`, Bangladesh) y el dataset privado de Kaggle `ronaldlchuquilin/fitolens-maiz-citricos`.
   - El volumen de muestras es inferior a 150–250 fotos de campo.
3. **Consecuencia**: El clasificador aprende un prior sesgado. Ante la menor duda o ante una textura atípica, la función de pérdida favorece numéricamente la predicción de la clase hiper-representada (`maiz_tizon_hoja`).

### B. Morfología de las fotos: Oruga visible vs. daño foliar mecánico
- La gran mayoría de fotografías en los datasets de plagas agronómicas se centran en el **insecto visible** (la larva u oruga de *Spodoptera frugiperda* posada en la hoja o en el cogollo).
- En el campo real, el agricultor toma la foto cuando el daño ya ocurrió: la larva suele estar escondida en el interior del verticilo, migró a otra planta o ya pupó en el suelo. Lo que queda en la hoja es el daño mecánico: **perforaciones irregulares tipo "ventanilla", bordes carcomidos y aserrín fecal granular marrón/amarillento (*frass*)**.
- Como la red fue entrenada con fotos donde aparecía el cuerpo cilíndrico y segmentado del gusano, **nunca aprendió que los huecos masticados y el aserrín son la firma visual de `maiz_gusano_cogollero`**.
- Al recibir una hoja con huecos, los bordes rasgados sufren desecación rápida y necrosis perimetral. Para los filtros convolucionales de bajo nivel, un borde seco de una perforación comparte bordes de alto contraste y gradientes marrones muy similares a los márgenes de una mancha por *Exserohilum turcicum*.

### C. Aumentos de datos destructivos (`aumentos.py`)
El pipeline original de aumentos resultaba perjudicial para lesiones discretas como perforaciones:
1. **Recorte aleatorio excesivo (`RandomResizedCrop(tam, scale=(0.35, 1.0), ratio=(0.75, 1.33))`):**
   - Una escala mínima de `0.35` toma un recorte que abarca solo el 35 % de la hoja. Si los huecos están localizados, el recorte frecuentemente cae sobre una zona verde limpia. Al obligar a la red a predecir `maiz_gusano_cogollero` sobre un parche de lámina verde sana, se produce **desalineación de etiquetas**.
   - La relación de aspecto `(0.75, 1.33)` estira el recorte: un hueco circular o irregular se deforma geométricamente en una elipse alargada, adquiriendo la forma exacta de "puro o cigarro" típica de las lesiones de tizón norteño.
2. **Desenfoque gaussiano (`GaussianBlur` con sigma hasta 2.0 y p=0.25):**
   - El aserrín (*frass*) se compone de partículas granulares diminutas de alta frecuencia espacial. Un desenfoque fuerte lo convierte en una mancha borrosa de color marrón claro, indistinguible de una necrosis fúngica incipiente.
3. **Borrado aleatorio (`RandomErasing` con p=0.2 y escala 0.02 a 0.12):**
   - Inserta rectángulos aleatorios de ruido o color constante sobre la imagen, tapando los pocos huecos reales presentes o introduciendo artefactos que confunden a la red sobre qué es un agujero real y qué es una oclusión.

### D. Temperatura de calibración, umbrales y mapa de calor erróneo
- **Por qué el mapa de calor (CAM) marcó una zona foliar sin lesión:**
  El método CAM calcula `cam = einsum(fc.weight, feature_maps)`. Cada neurona de la última capa lineal activa el mapa con los pesos de su clase. Cuando el clasificador asigna erróneamente la clase `maiz_tizon_hoja` debido al sesgo a priori y a la ausencia de la larva, la proyección de pesos busca cualquier indicio correlacionado espuriamente con tizón en el dataset de laboratorio (por ejemplo, venas longitudinales pronunciadas, variaciones de luz o bordes de la hoja en zonas sanas). Como no existe tizón real en la foto, el pico de activación cae en un área completamente sana.
- **Por qué dio 98 % de confianza:**
  Al existir una desproporción abrumadora de datos a favor de tizón y no existir un logit fuerte para cogollero (al no verse la oruga), la diferencia entre logits se amplifica exponencialmente en el softmax. Con temperaturas de calibración moderadas ($T \approx 1.0$), esa separación de logits satura la probabilidad en $\ge 98\ \%$.
- **Ausencia de regla de ambigüedad:**
  El sistema original solo evaluaba `confianza >= umbral`. No evaluaba si dos clases con sintomatología fácilmente confundible (perforación foliar vs mancha necrótica) estaban compitiendo o si la red estaba proyectando una decisión no segura.

---

## 3. Cambios Implementados en el Código de Entrenamiento

Se realizaron intervenciones pequeñas y específicas en el código de entrenamiento sin alterar las dependencias ni la API:

### 1. `entrenamiento/fitolens_ent/catalogo.py`
- Se agregó el especialista `"maiz"` a `CLASES` con sus 5 variantes: `maiz_sana`, `maiz_tizon_hoja`, `maiz_roya_comun`, `maiz_mancha_gris`, `maiz_gusano_cogollero`.
- Se registraron sus etiquetas formales en `ETIQUETAS` y se vinculó en `ESPECIALISTA_DE_CULTIVO["maiz"] = "maiz"`.
- Se añadieron las fuentes `maiz_bd` (Mendeley `sb4wwjs8bz`) y `maiz_mld` (Mendeley `3myfctrgk3`) en `FUENTES`.
- Se configuró la receta específica `RECETA_POR_MODELO["maiz"]` con:
  - `escala_recorte_min=0.60` (evita recortes pequeños que eliminen los huecos).
  - `sobremuestreo={"maiz_gusano_cogollero": 2.5}` (aumenta 2.5 veces la probabilidad de muestreo de fotos de cogollero en cada época).
  - `peso_perdida={"maiz_gusano_cogollero": 2.0}` (penaliza el doble los errores cometidos sobre cogollero en la función de pérdida).

### 2. `entrenamiento/fitolens_ent/aumentos.py`
- La función `entrenamiento(tam, escala_min=0.35, cultivo=None)` ahora detecta cuándo se entrena maíz o se especifica una escala conservadora.
- Para maíz:
  - `scale=(escala_min, 1.0)` con `escala_min=0.60`: se preserva siempre al menos el 60 % del área foliar, garantizando que los huecos y el aserrín permanezcan dentro del cuadro.
  - `ratio=(0.85, 1.18)`: restringe la deformación de aspecto, evitando que los orificios se estiren artificialmente en forma de lesión de tizón.
  - Desenfoque más suave (`GaussianBlur` con sigma `(0.1, 1.0)` y probabilidad reducida `p=0.10`) para conservar la textura granular del aserrín.
  - `RandomErasing` reducido a `p=0.10` y escala pequeña `(0.02, 0.05)` para no destruir perforaciones diagnósticas.
- Los otros cultivos mantienen exactamente su configuración previa por defecto.

### 3. `entrenamiento/fitolens_ent/reglas.py`
- Se incluyó `"maiz"` en la tupla `CULTIVOS` y en la función detectora `_cultivo()`.
- Se creó la regla de etiquetado `maiz(carpeta, cfg)` para reconocer nombres de carpetas de los datasets de maíz (`healthy`, `blight`, `rust`, `cercospora`, `armyworm`, `spodoptera`, etc.).
- Se implementó la regla de incertidumbre `es_diagnostico_seguro()` con `MARGEN_MIN_MAIZ = 0.15`:
  - Si la predicción compite entre `maiz_gusano_cogollero` y `maiz_tizon_hoja` con una diferencia absoluta menor a `0.15`, el diagnóstico se evalúa como no seguro (`ambiguedad_cogollero_tizon`).

### 4. `entrenamiento/fitolens_ent/entrenar.py`
- En `entrenar_backbone()`:
  - Se incorporó el factor de `sobremuestreo` en los pesos del `WeightedRandomSampler`.
  - Se habilitó `peso_perdida` en `nn.CrossEntropyLoss` ponderando las clases minoritarias.
  - Se propagaron los parámetros `escala_min` y `cultivo` al `Conjunto` de datos.
- En `metricas()` y `elegir_umbral()`:
  - Se agregó la verificación de conflicto para maíz: las predicciones donde la diferencia entre cogollero y tizón sea menor a 0.15 se excluyen de las respuestas válidas con umbral (quedan como no concluyentes).
- En la generación de `manifest.json`:
  - Se añade la propiedad `regla_no_seguro` documentando el margen mínimo de 0.15 y las clases en conflicto.

### 5. `entrenamiento/construir_notebooks.py`
- Se incluyó `"maiz"` en la lista `MODELOS`, permitiendo generar tanto `fitolens_maiz.ipynb` como la celda de maíz en `fitolens_todos.ipynb`.

---

## 4. Fotos Nuevas Recomendadas para el Dataset

Para solucionar definitivamente la confusión morfológica en el clasificador, se deben incorporar nuevas fotografías de campo recolectadas en parcelas de maíz (por ejemplo, en San Martín / Moyobamba / Bellavista / Tarapoto):

1. **Huecos y "ventanillas" sin oruga visible:**
   - 80 a 150 fotos de hojas con daño foliar fresco y seco donde la larva ya no esté en la hoja.
   - Variar la cantidad de perforaciones: desde 1 o 2 huecos aislados hasta hojas intensamente carcomidas.
2. **Presencia de aserrín / excremento fecal (*frass*):**
   - 50 a 80 fotos en primer plano del verticilo/cogollo y de la base de la lámina foliar con acumulación visible de aserrín granular húmedo o seco.
3. **Estadios tempranos y tardíos:**
   - Daño inicial tipo "raspado" o ventanilla (cuando la larva recién nacida come solo la epidermis).
   - Perforaciones maduras con necrosis desecativa en los bordes.
4. **Condiciones de captura:**
   - Distancia de captura recomendada: entre 20 y 45 cm de la hoja.
   - Iluminación natural de campo (mañana o tarde), evitando el uso de flash directo que queme los blancos de las perforaciones o elimine la sombra proyectada a través de los huecos.
   - Fondo de campo real (suelo, otras hojas de maíz, tallos), no cartulinas blancas ni fondos lisos de laboratorio.

---

## 5. Procedimiento para Reentrenar en Kaggle

Sigue estos pasos en la siguiente ronda de entrenamiento en Kaggle:

1. **Subir las imágenes actualizadas:**
   - Sube las fotos nuevas a tu dataset privado de Kaggle `ronaldlchuquilin/fitolens-maiz-citricos` en la carpeta correspondiente a cogollero (`maiz_gusano_cogollero`).
   - O bien súbelas como dataset independiente con el nombre `fitolens-maiz-mld` o `fitolens-maiz`.
2. **Regenerar los notebooks del repositorio:**
   - Si trabajas en un entorno con terminal habilitada:
     ```bash
     python entrenamiento/construir_notebooks.py
     ```
   - Esto actualizará `entrenamiento/notebooks/fitolens_todos.ipynb` e incluirá `fitolens_maiz.ipynb`.
3. **Importar y configurar en Kaggle:**
   - En [kaggle.com](https://www.kaggle.com): **Create → New Notebook → File → Import Notebook**.
   - Sube `fitolens_maiz.ipynb` (para entrenar solo maíz en ~30-45 min) o `fitolens_todos.ipynb`.
   - En el panel derecho (*Settings*):
     - **Accelerator**: `GPU T4 x2` o `GPU P100`.
     - **Internet**: `On`.
   - Con **+ Add Input**, añade los datasets requeridos:
     - `ronaldlchuquilin/fitolens-maiz-citricos`
     - Datasets base de respaldo si aplica.
4. **Ejecutar el entrenamiento:**
   - Menú **Save Version → Save & Run All (Commit)**.
   - El script ejecutará:
     ```bash
     python -m fitolens_ent.entrenar --modelo maiz
     ```
   - El script entrenará los backbones (`convnext_tiny` y `tf_efficientnetv2_b2`), aplicará el sobremuestreo y los nuevos aumentos conservadores, evaluará la temperatura y seleccionará el mejor backbone basado en validación de campo.
5. **Descargar y empaquetar resultados:**
   - En la pestaña **Output** del notebook, descarga `salida/modelo_maiz.zip`.
   - Revisa `salida/maiz/metricas.json` verificando:
     - F1 macro en prueba de campo $\ge 0.85$.
     - Que `maiz_gusano_cogollero` no tenga recall cercano a cero.
     - Que la regla de ambigüedad haya filtrado las muestras dudosas hacia `con_umbral`.
   - Empaqueta el modelo resultante con los demás modelos para el Release de GitHub:
     ```bash
     python entrenamiento/empaquetar_modelos.py modelo_router.zip modelo_hortalizas.zip modelo_cafe.zip modelo_cacao.zip modelo_maiz.zip
     ```
   - Sube el archivo `modelos.zip` al Release de GitHub (`modelos-vN`) y actualiza el VPS con `./fitolens.sh modelos modelos-vN`.
