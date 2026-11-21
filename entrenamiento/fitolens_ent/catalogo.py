"""Catálogo único de FitoLens: clases, fuentes de datos y receta de cada modelo.

Para mantener el proyecto, casi todo cambio se hace aquí:
- agregar una enfermedad  -> añadirla a CLASES[...] y una regla en reglas.py
- agregar un dataset      -> añadir una entrada en FUENTES
- cambiar la receta       -> editar RECETA / RECETA_POR_MODELO
"""

# ---------------------------------------------------------------- clases
# ids en snake_case, prefijo de cultivo y "_sana" para las sanas (contrato con la API y la web)
CLASES = {
    "router": ["pimiento", "papa", "tomate", "cafe", "cacao", "otra_planta", "no_planta"],
    "hortalizas": [
        "pimiento_mancha_bacteriana", "pimiento_sana",
        "papa_tizon_temprano", "papa_tizon_tardio", "papa_sana",
        "tomate_mancha_bacteriana", "tomate_tizon_temprano", "tomate_tizon_tardio",
        "tomate_moho_hoja", "tomate_septoriosis", "tomate_arana_roja", "tomate_mancha_diana",
        "tomate_virus_rizado_amarillo", "tomate_virus_mosaico", "tomate_sana",
    ],
    "cafe": ["cafe_sana", "cafe_roya", "cafe_ojo_de_gallo"],
    "cacao": ["cacao_sana", "cacao_monilia", "cacao_mazorca_negra"],
    "maiz": [
        "maiz_sana", "maiz_tizon_hoja", "maiz_roya_comun", "maiz_mancha_gris",
        "maiz_gusano_cogollero",
    ],
}

ETIQUETAS = {
    "pimiento": "Pimiento", "papa": "Papa", "tomate": "Tomate", "cafe": "Café", "cacao": "Cacao",
    "otra_planta": "Otra planta (no soportada)", "no_planta": "No es una planta",
    "pimiento_mancha_bacteriana": "Pimiento: mancha bacteriana", "pimiento_sana": "Pimiento: sana",
    "papa_tizon_temprano": "Papa: tizón temprano", "papa_tizon_tardio": "Papa: tizón tardío (rancha)",
    "papa_sana": "Papa: sana",
    "tomate_mancha_bacteriana": "Tomate: mancha bacteriana", "tomate_tizon_temprano": "Tomate: tizón temprano",
    "tomate_tizon_tardio": "Tomate: tizón tardío", "tomate_moho_hoja": "Tomate: moho de la hoja",
    "tomate_septoriosis": "Tomate: septoriosis", "tomate_arana_roja": "Tomate: araña roja",
    "tomate_mancha_diana": "Tomate: mancha diana", "tomate_virus_rizado_amarillo": "Tomate: virus del rizado amarillo",
    "tomate_virus_mosaico": "Tomate: virus del mosaico", "tomate_sana": "Tomate: sana",
    "cafe_sana": "Café: sana", "cafe_roya": "Café: roya", "cafe_ojo_de_gallo": "Café: ojo de gallo",
    "cacao_sana": "Cacao: sana", "cacao_monilia": "Cacao: moniliasis", "cacao_mazorca_negra": "Cacao: mazorca negra",
    "maiz_sana": "Maíz: sana", "maiz_tizon_hoja": "Maíz: tizón de la hoja",
    "maiz_roya_comun": "Maíz: roya común", "maiz_mancha_gris": "Maíz: mancha gris",
    "maiz_gusano_cogollero": "Maíz: gusano cogollero", "maiz": "Maíz",
}

ESPECIALISTA_DE_CULTIVO = {"pimiento": "hortalizas", "papa": "hortalizas", "tomate": "hortalizas",
                           "cafe": "cafe", "cacao": "cacao", "maiz": "maiz"}
RECHAZO = ["otra_planta", "no_planta"]

# ---------------------------------------------------------------- fuentes
# tipo: kaggle (kagglehub) | git | mendeley | url
# campo: True si son fotos reales de campo (solo estas entran en validación y prueba)
# regla: función de reglas.py que convierte la ruta en etiqueta
# requerido: si falla la descarga, el entrenamiento se detiene (False: solo avisa)
# Respaldo manual: si una descarga falla, sube el archivo como dataset de Kaggle
# llamado "fitolens-<clave>" y agrégalo al notebook; se busca primero en /kaggle/input.
FUENTES = {
    "plantvillage": dict(
        tipo="kaggle", ref="abdallahalidev/plantvillage-dataset", campo=False, regla="hortalizas",
        incluir="/color/", modelos=["hortalizas", "router"], requerido=True,
        cita="Hughes y Salathé (2015), PlantVillage. Copia en Kaggle: abdallahalidev/plantvillage-dataset",
        licencia="ver la fuente original (PlantVillage)"),
    "plantdoc": dict(
        tipo="git", url="https://github.com/pratikkayal/PlantDoc-Dataset.git", campo=True, regla="hortalizas",
        split_por_carpeta=True, sin_enfermedad_es_sana=True, modelos=["hortalizas", "router"], requerido=True,
        cita="Singh et al. (2020), PlantDoc, CODS-COMAD", licencia="CC BY 4.0"),
    "papa_indonesia": dict(
        tipo="mendeley", id="ptz377bwb8", version=1, campo=True, regla="papa_indonesia",
        modelos=["hortalizas", "router"], requerido=False,
        cita="Potato Leaf Disease Dataset in Uncontrolled Environment, Mendeley Data, 10.17632/ptz377bwb8.1",
        licencia="CC BY 4.0"),
    "tomate_bangladesh": dict(
        tipo="mendeley", id="rnbsw72zb5", version=1, campo=True, regla="solo_tomate",
        modelos=["router"], requerido=False,
        cita="Tomato Leaf Image Dataset for Disease Analysis in Real-World Environment, 10.17632/rnbsw72zb5.1",
        licencia="CC BY 4.0"),
    "tomate_bangladesh_2025": dict(
        tipo="mendeley", id="93h9p62kg4", version=1, campo=True, regla="tomate_bangladesh_2025",
        modelos=["hortalizas", "router"], requerido=False, activo=False,  # licencia no indicada en la página
        cita="Tomato leaf diseases, Mendeley Data, 10.17632/93h9p62kg4.1", licencia="no indicada (desactivado)"),
    "cafe_saposoa": dict(
        tipo="mendeley", id="mfpxg4y65r", version=2, campo=True, regla="cafe",
        modelos=["cafe", "router"], requerido=True,
        cita="Coffee leaf dataset by phytosanitary class (Saposoa), Mendeley Data, 10.17632/mfpxg4y65r.2",
        licencia="CC BY 4.0"),
    "cacao_monilia": dict(
        tipo="url", url="https://zenodo.org/records/17716661/files/CocoaMoniliaDataSet.zip?download=1",
        extraer=["cocoapods_images/", "YOLO_annotations/"], campo=True, regla="cacao_monilia", recorte_yolo=True,
        modelos=["cacao", "router"], requerido=True,
        cita="CocoaMoniliaDataSet, Zenodo, 10.5281/zenodo.17716661", licencia="CC BY 4.0"),
    "cacao_kaggle": dict(
        tipo="kaggle", ref="serranosebas/enfermedades-cacao-yolov4", campo=True, regla="cacao_yolo",
        recorte_yolo=True, modelos=["cacao", "router"], requerido=False,
        cita="Cocoa Diseases (YOLOv4), Kaggle serranosebas/enfermedades-cacao-yolov4", licencia="ODbL"),
    "maiz_bd": dict(
        tipo="mendeley", id="sb4wwjs8bz", version=1, campo=True, regla="maiz",
        modelos=["maiz", "router"], requerido=False,
        cita="An Open-Source Multi-Format Maize Leaf Image Dataset, Mendeley Data, 10.17632/sb4wwjs8bz.1",
        licencia="CC BY 4.0"),
    "maiz_mld": dict(
        tipo="mendeley", id="3myfctrgk3", version=1, campo=True, regla="maiz",
        modelos=["maiz", "router"], requerido=False,
        cita="MLD: Multi-Class Maize Leaf Disease Image Dataset, Mendeley Data, 10.17632/3myfctrgk3.1",
        licencia="CC BY 4.0"),
    # Verificado en Kaggle: humphreyassibi/armyworm-and-affected-plants (fotos de campo de daño de fall armyworm en hojas de maíz)
    "maiz_armyworm": dict(
        tipo="kaggle", ref="humphreyassibi/armyworm-and-affected-plants", campo=True, regla="maiz",
        modelos=["maiz", "router"], requerido=False,
        cita="Humphrey Assibi, Armyworm and Affected Plants, Kaggle humphreyassibi/armyworm-and-affected-plants",
        licencia="CC BY 4.0 / ver Kaggle"),
    # Verificado en Kaggle: rahimanshu/ccmt-plant-disease-dataset (fotos de campo naturales, incluye clase Maize_fall armyworm)
    "maiz_ccmt": dict(
        tipo="kaggle", ref="rahimanshu/ccmt-plant-disease-dataset", campo=True, regla="maiz",
        modelos=["maiz", "router"], requerido=False,
        cita="CCMT Plant Disease Dataset (Verma et al.), Kaggle rahimanshu/ccmt-plant-disease-dataset",
        licencia="CC BY 4.0"),
    # Verificado en Kaggle: dataset privado de Ronald con fotos de campo de maíz y cítricos
    "maiz_citricos": dict(
        tipo="kaggle", ref="ronaldlchuquilin/fitolens-maiz-citricos", campo=True, regla="maiz",
        modelos=["maiz", "router"], requerido=False,
        cita="Ronald Chuquilin, Fitolens Maíz y Cítricos, Kaggle ronaldlchuquilin/fitolens-maiz-citricos",
        licencia="privada"),
    "no_planta": dict(
        tipo="kaggle", ref="prasunroy/natural-images", campo=True, regla="no_planta",
        modelos=["router"], requerido=True,
        cita="Roy et al. (2018), Natural Images, Kaggle prasunroy/natural-images", licencia="ver la fuente"),
}

# ---------------------------------------------------------------- receta
RECETA = dict(
    backbones=["convnext_tiny.fb_in22k_ft_in1k", "tf_efficientnetv2_b2.in1k"],
    tam=256,                 # entrada H = W
    lote=32,
    epocas_cabeza=2, lr_cabeza=1e-3,
    epocas=25, lr=1e-4, wd=0.05, suavizado=0.1, paciencia=6,
    muestras_por_epoca=12000,   # tope de fotos por época (el muestreo es con reemplazo)
    peso_campo=3.0,             # las fotos de campo salen 3 veces más en el muestreo
    max_por_clase_y_fuente=4000,
    tta=True,                   # espejo horizontal promediado dentro del ONNX
    precision_objetivo=0.90,    # el umbral se elige para acertar >= 90 % de lo que sí responde (en validación)
    latencia_max_ms=300,        # backbone descartado si supera esto en CPU
    semilla=42,
)
RECETA_POR_MODELO = {
    "router": dict(muestras_por_epoca=16000, epocas=15),
    "cafe": dict(muestras_por_epoca=4000, epocas=30),
    "cacao": dict(muestras_por_epoca=4000, epocas=30),
    "maiz": dict(
        muestras_por_epoca=6000,
        epocas=25,
        escala_recorte_min=0.60,
        sobremuestreo={"maiz_gusano_cogollero": 2.5},
        peso_perdida={"maiz_gusano_cogollero": 2.0},
    ),
}
MIN_FOTOS_CLASE = 30   # una clase con menos fotos de entrenamiento se quita del modelo (y se avisa)


def receta(modelo):
    r = dict(RECETA)
    r.update(RECETA_POR_MODELO.get(modelo, {}))
    return r
