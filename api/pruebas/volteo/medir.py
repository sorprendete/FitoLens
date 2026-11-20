"""Compara el diagnóstico con y sin VOLTEO (foto volteada arriba-abajo cuando el modelo duda).

Uso (desde api/):  python pruebas/volteo/medir.py <carpeta test de PlantDoc> [carpeta de modelos]
PlantDoc:  git clone --depth 1 --filter=blob:none --sparse https://github.com/pratikkayal/PlantDoc-Dataset.git
           && cd PlantDoc-Dataset && git sparse-checkout set test
Escribe pruebas/volteo/resultados/resumen.json y por_imagen.csv.
"""
import csv
import json
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[1]))
sys.path.insert(0, str(AQUI.parents[2] / "entrenamiento"))
from fitolens_ent import reglas  # noqa: E402
from app.ia.pipeline import diagnosticar  # noqa: E402
from app.ia.registro import cargar  # noqa: E402


def fotos(plantdoc: Path, muestras: Path):
    for d in sorted(p for p in plantdoc.iterdir() if p.is_dir()):
        et = reglas.hortalizas(d.name, {"sin_enfermedad_es_sana": True})
        for f in sorted(d.iterdir()):
            yield "plantdoc", f, et
    for d in sorted(p for p in muestras.iterdir() if p.is_dir()):
        for f in sorted(d.iterdir()):
            yield "muestras", f, d.name


def veredicto(r, et):
    if et in ("otra_planta", "no_planta"):
        return "bien" if r.estado == "rechazada" else "mal" if r.estado == "diagnostico" else "duda"
    if r.estado != "diagnostico":
        return "duda"  # rechazada o no concluyente: no da un diagnóstico equivocado
    return "bien" if r.clase == et else "mal"


def main():
    plantdoc = Path(sys.argv[1])
    modelos = Path(sys.argv[2]) if len(sys.argv) > 2 else AQUI.parents[2] / "modelos"
    reg = cargar(modelos, 2, segmentar=True)
    filas, ms = [], {False: [], True: []}
    for fuente, ruta, et in fotos(plantdoc, modelos / "muestras"):
        img = ImageOps.exif_transpose(Image.open(ruta)).convert("RGB")
        fila = {"fuente": fuente, "foto": f"{ruta.parent.name}/{ruta.name}", "etiqueta": et}
        for volteo in (False, True):
            reg.volteo = volteo
            t = time.perf_counter()
            r = diagnosticar(reg, img)
            dt = (time.perf_counter() - t) * 1000
            ms[volteo].append(dt)
            k = "con" if volteo else "sin"
            fila |= {f"{k}_veredicto": veredicto(r, et), f"{k}_clase": r.clase or r.estado, f"{k}_ms": round(dt),
                     f"{k}_volteo_usado": any("de cabeza" in p["detalle"] for p in r.pasos)}
        filas.append(fila)
    resumen = {}
    for fuente in ("plantdoc", "muestras"):
        fs = [f for f in filas if f["fuente"] == fuente]
        resumen[fuente] = {
            "n": len(fs),
            "sin_volteo": dict(Counter(f["sin_veredicto"] for f in fs)),
            "con_volteo": dict(Counter(f["con_veredicto"] for f in fs)),
            "cambios": dict(Counter(f"{f['sin_veredicto']}->{f['con_veredicto']}" for f in fs
                                    if f["sin_veredicto"] != f["con_veredicto"])),
            "fotos_que_usaron_volteo": sum(f["con_volteo_usado"] for f in fs),
        }
    for volteo, k in ((False, "sin"), (True, "con")):
        v = sorted(ms[volteo])
        resumen[f"ms_{k}_volteo"] = {"p50": round(statistics.median(v)), "p95": round(v[int(len(v) * 0.95)]),
                                     "promedio": round(statistics.mean(v))}
    salida = AQUI / "resultados"
    salida.mkdir(exist_ok=True)
    (salida / "resumen.json").write_text(json.dumps(resumen, indent=1, ensure_ascii=False))
    with open(salida / "por_imagen.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0]))
        w.writeheader()
        w.writerows(filas)
    print(json.dumps(resumen, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
