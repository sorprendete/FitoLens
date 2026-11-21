"""Catálogo único de FitoLens: clases, fuentes de datos y receta de cada modelo.

Para mantener el proyecto, casi todo cambio se hace aquí:
- agregar una enfermedad  -> añadirla a CLASES[...] y una regla en reglas.py
- agregar un dataset      -> añadir una entrada en FUENTES
- cambiar la receta       -> editar RECETA / RECETA_POR_MODELO
"""

# ---------------------------------------------------------------- clases
# ids en snake_case, prefijo de cultivo y "_sana" para las sanas (contrato con la API y la web)
CLASES = {
    "router": ["pimiento", "papa", "tomate", "cafe", "cacao", "maiz", "limon", "naranja", "otra_planta", "no_planta"],
    "hortalizas": [
        "pimiento_mancha_bacteriana", "pimiento_sana",
        "papa_tizon_temprano", "papa_tizon_tardio", "papa_sana",
        "tomate_mancha_bacteriana", "tomate_tizon_temprano", "tomate_tizon_tardio",
        "tomate_moho_hoja", "tomate_septoriosis", "tomate_arana_roja", "tomate_mancha_diana",
        "tomate_virus_rizado_amarillo", "tomate_virus_mosaico", "tomate_sana",
    ],
    "cafe": ["cafe_sana", "cafe_roya", "cafe_ojo_de_gallo"],
    "cacao": ["cacao_sana", "cacao_monilia", "cacao_mazorca_negra"],
    "maiz": ["maiz_tizon_hoja", "maiz_roya_comun", "maiz_mancha_gris", "maiz_gusano_cogollero", "maiz_sana"],
    # un solo modelo para limón y naranja; la API filtra por el cultivo que dio el router
    "citricos": [
        "limon_cancrosis", "limon_hlb", "limon_mancha_negra", "limon_melanosis", "limon_sarna",
        "limon_fumagina", "limon_minador", "limon_sana",
        "naranja_cancrosis", "naranja_hlb", "naranja_sana",
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
    "maiz": "Maíz", "limon": "Limón", "naranja": "Naranja",
    "maiz_tizon_hoja": "Maíz: tizón de la hoja", "maiz_roya_comun": "Maíz: roya común",
    "maiz_mancha_gris": "Maíz: mancha gris", "maiz_gusano_cogollero": "Maíz: gusano cogollero",
    "maiz_sana": "Maíz: sana",
    "limon_cancrosis": "Limón: cancrosis", "limon_hlb": "Limón: HLB (huanglongbing)",
    "limon_mancha_negra": "Limón: mancha negra", "limon_melanosis": "Limón: melanosis",
    "limon_sarna": "Limón: sarna", "limon_fumagina": "Limón: fumagina", "limon_minador": "Limón: minador de la hoja",
    "limon_sana": "Limón: sana",
    "naranja_cancrosis": "Naranja: cancrosis", "naranja_hlb": "Naranja: HLB (huanglongbing)", "naranja_sana": "Naranja: sana",
}

ESPECIALISTA_DE_CULTIVO = {"pimiento": "hortalizas", "papa": "hortalizas", "tomate": "hortalizas",
                           "cafe": "cafe", "cacao": "cacao",
                           "maiz": "maiz", "limon": "citricos", "naranja": "citricos"}
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
        incluir="/color/", modelos=["hortalizas", "maiz", "citricos", "router"], requerido=True,
        cita="Hughes y Salathé (2015), PlantVillage. Copia en Kaggle: abdallahalidev/plantvillage-dataset",
        licencia="ver la fuente original (PlantVillage)"),
    "plantdoc": dict(
        tipo="git", url="https://github.com/pratikkayal/PlantDoc-Dataset.git", campo=True, regla="hortalizas",
        split_por_carpeta=True, sin_enfermedad_es_sana=True, modelos=["hortalizas", "maiz", "router"], requerido=True,
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
        modelos=["hortalizas", "router"], requerido=True,
        cita="Tomato leaf diseases (Bangladesh, campo), Mendeley Data, 10.17632/93h9p62kg4.1", licencia="CC BY 4.0"),
    "cafe_saposoa": dict(
        tipo="mendeley", id="mfpxg4y65r", version=2, campo=True, regla="cafe",
        modelos=["cafe", "router"], requerido=True,
        cita="Coffee leaf dataset by phytosanitary class (Saposoa), Mendeley Data, 10.17632/mfpxg4y65r.2",
        licencia="CC BY 4.0"),
    "cafe_bracol": dict(
        tipo="kaggle", ref="ronaldlchuquilin/fitolens-cafe-otras", kaggle_input="fitolens-cafe-otras", incluir="/bracol/",
        campo=True, regla="cafe", modelos=["cafe", "router"], requerido=True,
        cita="BRACOL, Brazilian Arabica Coffee Leaf images, Mendeley Data, 10.17632/yy2k5y8mxg.1", licencia="CC BY 4.0"),
    "cafe_jmuben": dict(
        tipo="kaggle", ref="ronaldlchuquilin/fitolens-cafe-otras", kaggle_input="fitolens-cafe-otras", incluir="/jmuben/",
        campo=True, solo_train=True,   # viene recortada y aumentada: no sirve para medir
        regla="cafe", modelos=["cafe", "router"], requerido=True,
        cita="JMuBEN, Arabica coffee leaf images (Kenia), Mendeley Data, 10.17632/t2r6rszp5c.1", licencia="CC BY 4.0"),
    "cacao_filipinas": dict(
        tipo="kaggle", ref="zaldyjr/cacao-diseases", campo=True, regla="cacao_yolo",
        modelos=["cacao", "router"], requerido=True,
        cita="Cacao Diseases (Filipinas), Kaggle zaldyjr/cacao-diseases", licencia="no indicada en Kaggle"),
    "cacao_monilia": dict(
        tipo="url", url="https://zenodo.org/records/17716661/files/CocoaMoniliaDataSet.zip?download=1",
        extraer=["cocoapods_images/", "YOLO_annotations/"], campo=True, regla="cacao_monilia", recorte_yolo=True,
        modelos=["cacao", "router"], requerido=True,
        cita="CocoaMoniliaDataSet, Zenodo, 10.5281/zenodo.17716661", licencia="CC BY 4.0"),
    "cacao_kaggle": dict(
        tipo="kaggle", ref="serranosebas/enfermedades-cacao-yolov4", campo=True, regla="cacao_yolo",
        recorte_yolo=True, modelos=["cacao", "router"], requerido=False,
        cita="Cocoa Diseases (YOLOv4), Kaggle serranosebas/enfermedades-cacao-yolov4", licencia="ODbL"),
    # maíz y cítricos: copias reducidas (640 px) en un dataset privado de Kaggle, una carpeta por fuente
    "maiz_bd": dict(
        tipo="kaggle", ref="ronaldlchuquilin/fitolens-maiz-citricos", kaggle_input="fitolens-maiz-citricos",
        incluir="/maiz_bd/", campo=True, regla="maiz", modelos=["maiz", "router"], requerido=True,
        cita="An Open-Source Multi-Format Maize Leaf Image Dataset (Bangladesh), Mendeley Data, 10.17632/sb4wwjs8bz.1",
        licencia="CC BY 4.0"),
    "maiz_mld": dict(
        tipo="kaggle", ref="ronaldlchuquilin/fitolens-maiz-citricos", kaggle_input="fitolens-maiz-citricos",
        incluir="/maiz_mld/", campo=True, regla="maiz", modelos=["maiz", "router"], requerido=True,
        cita="MLD: A Multi-Class Maize Leaf Disease Image Dataset from Bangladesh, Mendeley Data, 10.17632/3myfctrgk3.1",
        licencia="CC BY 4.0"),
    "limon_bd": dict(
        tipo="kaggle", ref="ronaldlchuquilin/fitolens-maiz-citricos", kaggle_input="fitolens-maiz-citricos",
        incluir="/limon/", cultivo="limon", campo=True, regla="citricos", modelos=["citricos", "router"], requerido=True,
        cita="Large-Scale Lemon Leaf Disease and Pest Image Dataset from Bangladesh, Mendeley Data, 10.17632/8d9fv6kpt3.3",
        licencia="CC BY 4.0"),
    "naranja_bd": dict(
        tipo="kaggle", ref="ronaldlchuquilin/fitolens-maiz-citricos", kaggle_input="fitolens-maiz-citricos",
        incluir="/naranja/", cultivo="naranja", campo=True, regla="citricos", modelos=["citricos", "router"], requerido=True,
        cita="Multi-format open-source sweet orange leaf dataset, Mendeley Data, 10.17632/f7cr74mwpj.2",
        licencia="CC BY 4.0"),
    "maiz_estacional": dict(
        tipo="kaggle", ref="ronaldlchuquilin/fitolens-r4-extra", kaggle_input="fitolens-r4-extra",
        incluir="/maiz_estacional/", campo=True, regla="maiz", modelos=["maiz", "router"], requerido=True,
        cita="Seasonal Corn Leaf Disease Dataset (Bangladesh), Mendeley Data, 10.17632/vy629dngm8.1", licencia="CC BY 4.0"),
    "maiz_africa": dict(
        tipo="kaggle", ref="ronaldlchuquilin/fitolens-r5-maiz", kaggle_input="fitolens-r5-maiz",
        incluir="/maiz_africa/", campo=True, regla="maiz", modelos=["maiz", "router"], requerido=True,
        cita="Maize Crop Disease (Leaf), Mendeley Data, 10.17632/6w6gsvghfw.1 (solo fotos >400 px)", licencia="CC BY 4.0"),
    # gusano cogollero: daño foliar (huecos, aserrín) y larvas; solo entrenamiento para no cambiar la prueba
    "maiz_armyworm": dict(
        tipo="kaggle", ref="humphreyassibi/armyworm-and-affected-plants", campo=True, solo_train=True,
        regla="maiz", modelos=["maiz"], requerido=False,
        cita="Armyworm and Affected Plants, Kaggle humphreyassibi/armyworm-and-affected-plants", licencia="ver Kaggle"),
    "maiz_ccmt": dict(
        tipo="kaggle", ref="rahimanshu/ccmt-plant-disease-dataset", campo=True, solo_train=True, incluir="maize",
        regla="maiz", modelos=["maiz"], requerido=False,
        cita="CCMT Plant Disease Dataset (Ghana), Kaggle rahimanshu/ccmt-plant-disease-dataset", licencia="CC BY 4.0"),
    "limon_bdl": dict(
        tipo="kaggle", ref="ronaldlchuquilin/fitolens-r4-extra", kaggle_input="fitolens-r4-extra",
        incluir="/limon_bdl/", cultivo="limon", campo=True, regla="citricos", modelos=["router"], requerido=True,   # en cítricos bajó el acierto (ronda 4)
        cita="BDLemonLeaf, Mendeley Data, 10.17632/643f5bbc2t.6", licencia="CC BY 4.0"),
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
    ensamble=True,              # si en validación mejora, el ONNX promedia los dos backbones
    precision_objetivo=0.90,    # el umbral se elige para acertar >= 90 % de lo que sí responde (en validación)
    latencia_max_ms=300,        # backbone descartado si supera esto en CPU
    semilla=42,
)
RECETA_POR_MODELO = {
    "router": dict(muestras_por_epoca=16000, epocas=15, ensamble=False),
    "hortalizas": dict(muestras_por_epoca=14000, peso_campo=4.0),
    "cafe": dict(muestras_por_epoca=6000, epocas=30),
    "cacao": dict(muestras_por_epoca=6000, epocas=30),
    # refuerzo: multiplica cuántas veces sale una clase débil en el muestreo
    "maiz": dict(muestras_por_epoca=8000, epocas=20, peso_campo=5.0, max_por_clase_y_fuente=1500,
                 backbones=["convnext_tiny.fb_in22k_ft_in1k"], ensamble=False,
                 aumento_suave=True, refuerzo={"maiz_roya_comun": 1.5},
                 peso_perdida={"maiz_gusano_cogollero": 1.5}),
    "citricos": dict(muestras_por_epoca=12000, refuerzo={"limon_melanosis": 2.0, "limon_mancha_negra": 1.5}),
}
MIN_FOTOS_CLASE = 30   # una clase con menos fotos de entrenamiento se quita del modelo (y se avisa)


def receta(modelo):
    r = dict(RECETA)
    r.update(RECETA_POR_MODELO.get(modelo, {}))
    return r
