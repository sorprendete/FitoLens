"""Genera los notebooks de Kaggle a partir del código de fitolens_ent/.

Los notebooks llevan el código dentro (no necesitan clonar el repositorio, que puede ser privado).
Después de cambiar algo en fitolens_ent/, vuelve a ejecutar:  python entrenamiento/construir_notebooks.py
"""
import glob, json, os

AQUI = os.path.dirname(os.path.abspath(__file__))
MODELOS = ["router", "hortalizas", "cafe", "cacao", "maiz", "citricos"]


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
        celdas.append(celda("code", f"!python -m fitolens_ent.entrenar --modelo {m}"))
    celdas.append(celda("code",
        "import json, glob\n"
        "for f in sorted(glob.glob('/kaggle/working/salida/*/metricas.json')):\n"
        "    m = json.load(open(f))\n"
        "    c = m['campo']\n"
        "    print(f\"{m['modelo']:11} {m['backbone']:32} campo: acc={c['accuracy']} IC95={c['accuracy_ic95']} \"\n"
        "          f\"f1={c['f1_macro']} n={c['n']} | umbral {c['con_umbral']} | {m['latencia_ms']} ms\")\n"
        "!rm -rf /kaggle/working/fitolens/fuentes /kaggle/working/fitolens/cache  # deja solo los resultados en Output\n"
        f"fallidos = [m for m in {modelos!r} if not os.path.exists(f'/kaggle/working/salida/{{m}}/manifest.json')]\n"
        "assert not fallidos, f'Falló el entrenamiento de {fallidos}: revisa el error arriba (pestaña Logs)'"))
    return {"cells": celdas, "nbformat": 4, "nbformat_minor": 5,
            "metadata": {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
                         "language_info": {"name": "python"}}}


if __name__ == "__main__":
    carpeta = os.path.join(AQUI, "notebooks")
    os.makedirs(carpeta, exist_ok=True)
    for nombre, modelos in [(m, [m]) for m in MODELOS] + [("todos", MODELOS)]:
        ruta = os.path.join(carpeta, f"fitolens_{nombre}.ipynb")
        json.dump(notebook(modelos), open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("generado", ruta)
