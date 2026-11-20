# Datos de entrenamiento de FitoLens

Verificados el 20 de noviembre de 2026. La fuente única de verdad es `entrenamiento/fitolens_ent/catalogo.py`.

| Clave | Dataset | Tipo | Uso | Licencia |
|---|---|---|---|---|
| plantvillage | PlantVillage (Hughes y Salathé, 2015), copia Kaggle `abdallahalidev/plantvillage-dataset`, carpeta `color` | laboratorio | hortalizas, router (otras plantas) | ver fuente original |
| plantdoc | PlantDoc (Singh et al., 2020), github.com/pratikkayal/PlantDoc-Dataset, 2,598 fotos | campo (web) | hortalizas, router | CC BY 4.0 |
| papa_indonesia | Potato Leaf Disease Dataset in Uncontrolled Environment, 10.17632/ptz377bwb8.1, 3,076 fotos de fincas de Java Central | campo | papa sana y tizón tardío; el resto solo para el router | CC BY 4.0 |
| tomate_bangladesh | Tomato Leaf Image Dataset for Disease Analysis in Real-World Environment, 10.17632/rnbsw72zb5.1, 1,028 fotos (sana/enferma) | campo | solo router (no trae la enfermedad) | CC BY 4.0 |
| tomate_bangladesh_2025 | Tomato leaf diseases, 10.17632/93h9p62kg4.1, 2,659 fotos | campo | **desactivado**: la página no indica licencia | no indicada |
| cafe_saposoa | Coffee leaf dataset by phytosanitary class, 10.17632/mfpxg4y65r.2, 1,500 hojas de Saposoa (San Martín) | campo | café, router | CC BY 4.0 |
| cacao_monilia | CocoaMoniliaDataSet, 10.5281/zenodo.17716661, 1,953 mazorcas (h0 sana; m1, m2, m3 estadios de *Moniliophthora roreri*), recortadas con sus cajas YOLO | campo | cacao, router | CC BY 4.0 |
| cacao_kaggle | Cocoa Diseases (YOLOv4), Kaggle `serranosebas/enfermedades-cacao-yolov4` (monilia y phytophthora) | campo | cacao (mazorca negra), router | ODbL |
| no_planta | Natural Images (Roy et al., 2018), Kaggle `prasunroy/natural-images` (avión, auto, gato, perro, moto, persona) | — | router | ver fuente |

Descartados: **PlantSeg** (CC BY-NC, solo uso no comercial, y fotos tomadas de Internet, no de campo).

## Límites conocidos (decirlos en la Expoferia)

- **Mancha diana y araña roja del tomate** solo tienen fotos de laboratorio: su acierto en campo no se puede medir.
- **Mazorca negra del cacao** tiene pocas fotos (dataset de Kaggle). Si quedan menos de 30 para entrenar,
  la clase se quita automáticamente y se avisa en `metricas.json` (`datos.clases_quitadas`).
- Las fotos de campo de hortalizas son de otros países. Lo ideal es sumar fotos propias de San Martín:
  basta crear una carpeta por clase y añadirla como fuente en `catalogo.py`.
- Las cifras de campo salen de conjuntos de prueba pequeños: por eso `metricas.json` trae el intervalo de confianza del 95 %.
