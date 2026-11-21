"""Genera los notebooks de Kaggle a partir del código de fitolens_ent/.

Los notebooks llevan el código dentro (no necesitan clonar el repositorio, que puede ser privado).
Después de cambiar algo en fitolens_ent/, vuelve a ejecutar:  python entrenamiento/construir_notebooks.py
"""
import glob, json, os, shutil

AQUI = os.path.dirname(os.path.abspath(__file__))
MODELOS = ["router", "hortalizas", "cafe", "cacao", "maiz"]


def sincronizar_archivos_locales():
    origen = os.path.join(os.path.dirname(AQUI), "api", "pruebas", "huecos", "fotos", "maiz_gusano_cogollero", "ronald_huecos.jpg")
    if os.path.exists(origen):
        for dest in [
            os.path.join(AQUI, "fotos_campo", "maiz_gusano_cogollero", "ronald_huecos.jpg"),
            os.path.join(AQUI, "fotos_campo", "ronald_huecos.jpg"),
            os.path.join(AQUI, "fotos_propias", "maiz_gusano_cogollero", "ronald_huecos.jpg"),
        ]:
            if not os.path.exists(dest):
                try:
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    shutil.copy2(origen, dest)
                except Exception:
                    pass


def celda(tipo, texto):
    c = {"cell_type": tipo, "metadata": {}, "source": texto.splitlines(True)}
    if tipo == "code":
        c.update(execution_count=None, outputs=[])
    return c


def notebook(modelos):
    codigo = {os.path.basename(p): open(p, encoding="utf-8").read()
              for p in sorted(glob.glob(os.path.join(AQUI, "fitolens_ent", "*.py")))}
    titulo = ", ".join(modelos)
    celdas = [
        celda("markdown", f"# FitoLens: entrenar {titulo}\n\n"
              "1. Panel derecho → **Settings**: *Accelerator* = **GPU T4 x2** o **GPU P100**, *Internet* = **On**.\n"
              "2. Menú **Save Version** → **Save & Run All (Commit)**. Puedes cerrar la pestaña: corre solo.\n"
              "3. Al terminar, en la pestaña **Output** descarga `salida/modelo_<nombre>.zip`.\n\n"
              "El código se genera desde `entrenamiento/fitolens_ent/` del repositorio FitoLens: no lo edites aquí."),
        celda("code", "!pip install -q timm onnx onnxruntime imagehash\n"
              "!nvidia-smi --query-gpu=name,memory.total --format=csv"),
        celda("code", "import json, os\n"
              "os.makedirs('fitolens_ent', exist_ok=True)\n"
              f"ARCHIVOS = json.loads({json.dumps(json.dumps(codigo, ensure_ascii=False))})\n"
              "for nombre, texto in ARCHIVOS.items():\n"
              "    open(os.path.join('fitolens_ent', nombre), 'w', encoding='utf-8').write(texto)\n"
              "print(sorted(ARCHIVOS))"),
    ]
    for m in modelos:
        celdas.append(celda("code", f"!python -m fitolens_ent.entrenar --modelo {m}\n"
                            f"assert os.path.exists('/kaggle/working/salida/{m}/manifest.json'), "
                            f"'Falló el entrenamiento de {m}: revisa el error arriba (pestaña Logs)'"))
        if m == "maiz":
            celdas.append(celda("code",
                "# Verificación final del modelo de maíz: accuracy de campo >= 95.9%, matriz de confusión y predicciones SIN reglas\n"
                "import glob, json, os, numpy as np, onnxruntime as ort\n"
                "from PIL import Image\n"
                "from fitolens_ent.aumentos import cargar_como_api\n\n"
                "metr = json.load(open('/kaggle/working/salida/maiz/metricas.json'))\n"
                "manif = json.load(open('/kaggle/working/salida/maiz/manifest.json'))\n"
                "campo = metr['campo']\n"
                "clases = [c['nombre'] for c in manif['clases']]\n\n"
                "print('=== REPORTE OBLIGATORIO DE MAÍZ ===')\n"
                "print(f\"Accuracy de campo: {campo['accuracy']:.4f} (IC95: {campo['accuracy_ic95']})\")\n"
                "print('Matriz de confusión de campo:')\n"
                "for fila in campo['matriz_confusion']:\n"
                "    print(fila)\n\n"
                "# Evaluación de fotos_campo (incluyendo Ronald) SIN reglas\n"
                "fotos_campo = sorted(glob.glob('/kaggle/working/fitolens/fotos_campo/**/*.*', recursive=True) +\n"
                "                     glob.glob('/kaggle/working/fitolens/fotos_propias/**/*.*', recursive=True) +\n"
                "                     glob.glob('/kaggle/input/**/ronald_huecos.jpg', recursive=True))\n"
                "fotos_campo = [f for f in fotos_campo if f.lower().endswith(('.jpg', '.jpeg', '.png'))]\n"
                "so = ort.SessionOptions()\n"
                "so.intra_op_num_threads = 2\n"
                "ses = ort.InferenceSession('/kaggle/working/salida/maiz/model.onnx', so, providers=['CPUExecutionProvider'])\n\n"
                "pred_ronald = None\n"
                "print(f'\\nPredicciones para fotos de campo ({len(fotos_campo)}) SIN reglas:')\n"
                "for f in fotos_campo:\n"
                "    img = Image.open(f).convert('RGB')\n"
                "    t = cargar_como_api(img, 256).unsqueeze(0).numpy()\n"
                "    out = ses.run(None, {'imagen': t})\n"
                "    logits = out[0][0]\n"
                "    probs = np.exp(logits - np.max(logits))\n"
                "    probs /= probs.sum()\n"
                "    pred = clases[int(np.argmax(probs))]\n"
                "    print(f'  {os.path.basename(f)}: {pred} ({np.max(probs):.1%}) [SIN reglas]')\n"
                "    if 'ronald_huecos' in os.path.basename(f).lower():\n"
                "        pred_ronald = pred\n\n"
                "assert campo['accuracy'] >= 0.959, f\"FALLO VISIBLE: Accuracy de campo {campo['accuracy']:.4f} < 95.9%\"\n"
                "if pred_ronald is not None:\n"
                "    assert pred_ronald == 'maiz_gusano_cogollero', f\"FALLO VISIBLE: Foto de Ronald predicha como {pred_ronald}, no cogollero\"\n"
                "    print('\\n>> VALIDACIÓN EXITOSA: Accuracy >= 95.9% y foto de Ronald = maiz_gusano_cogollero <<')"
            ))
    celdas.append(celda("code",
        "import json, glob\n"
        "for f in sorted(glob.glob('/kaggle/working/salida/*/metricas.json')):\n"
        "    m = json.load(open(f))\n"
        "    c = m['campo']\n"
        "    print(f\"{m['modelo']:11} {m['backbone']:32} campo: acc={c['accuracy']} IC95={c['accuracy_ic95']} \"\n"
        "          f\"f1={c['f1_macro']} n={c['n']} | umbral {c['con_umbral']} | {m['latencia_ms']} ms\")\n"
        "!rm -rf /kaggle/working/fitolens/fuentes /kaggle/working/fitolens/cache  # deja solo los resultados en Output"))
    return {"cells": celdas, "nbformat": 4, "nbformat_minor": 5,
            "metadata": {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
                         "language_info": {"name": "python"}}}


if __name__ == "__main__":
    sincronizar_archivos_locales()
    carpeta = os.path.join(AQUI, "notebooks")
    os.makedirs(carpeta, exist_ok=True)
    for nombre, modelos in [(m, [m]) for m in MODELOS] + [("todos", MODELOS)]:
        ruta = os.path.join(carpeta, f"fitolens_{nombre}.ipynb")
        json.dump(notebook(modelos), open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("generado", ruta)
