"""Une los zips que salen de Kaggle en un solo modelos.zip (lo que se sube al Release "modelos-vN").

Uso:  python entrenamiento/empaquetar_modelos.py modelo_router.zip modelo_hortalizas.zip modelo_cafe.zip modelo_cacao.zip
Verifica que cada carpeta tenga model.onnx, manifest.json y metricas.json, y que el SHA-256 coincida.
"""
import hashlib, json, sys, zipfile

REQUERIDOS = ("model.onnx", "manifest.json", "metricas.json")

with zipfile.ZipFile("modelos.zip", "w", zipfile.ZIP_DEFLATED) as salida:
    for ruta in sys.argv[1:]:
        z = zipfile.ZipFile(ruta)
        nombres = z.namelist()
        carpeta = nombres[0].split("/")[0]
        for r in REQUERIDOS:
            assert f"{carpeta}/{r}" in nombres, f"{ruta}: falta {r}"
        manifest = json.loads(z.read(f"{carpeta}/manifest.json"))
        sha = hashlib.sha256(z.read(f"{carpeta}/model.onnx")).hexdigest()
        assert sha == manifest["sha256"], f"{ruta}: el SHA-256 del modelo no coincide con el manifest"
        metr = json.loads(z.read(f"{carpeta}/metricas.json"))
        print(f"{carpeta:11} v{manifest['version']}  campo acc={metr['campo']['accuracy']} "
              f"f1={metr['campo']['f1_macro']} n={metr['campo']['n']}")
        for r in REQUERIDOS:
            salida.writestr(f"{carpeta}/{r}", z.read(f"{carpeta}/{r}"))
print("listo: modelos.zip")
