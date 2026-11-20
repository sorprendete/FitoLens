"""Prepara los modelos de FitoLens para la app móvil (sin internet).

Por cada carpeta de modelos/ (router, hortalizas, cafe, cacao) que cumpla docs/contrato_modelos.md:
  1. Verifica el sha256 del model.onnx (FP32).
  2. Lo cuantiza a INT8 (estática QDQ, calibrada con fotos reales; si no hay fotos, dinámica).
  3. Compara INT8 contra FP32 en una muestra: coincidencia de clase y, si las fotos tienen
     etiqueta (subcarpeta = id de clase), accuracy de cada uno.
  4. Si la pérdida supera --max-perdida, deja el FP32 en la app (y lo avisa).
Escribe en la salida: <nombre>.onnx + modelos.json (clases, entrada, umbral, temperatura, comparación).

Uso:
  python cuantizar.py --modelos ../../modelos --fotos ../../muestras --salida ../../app/assets/modelos
  --fotos (opcional): carpeta con <id_clase>/*.jpg o fotos sueltas. Con ~50-200 fotos basta.
"""
import argparse
import hashlib
import json
import random
import shutil
import tempfile
from pathlib import Path

import numpy as np
import onnxruntime as ort
from onnxruntime.quantization.shape_inference import quant_pre_process
from onnxruntime.quantization import (CalibrationDataReader, QuantFormat, QuantType,
                                      quantize_dynamic, quantize_static)
from PIL import Image, ImageOps

EXT = {".jpg", ".jpeg", ".png", ".webp"}
ORDEN = ["router", "hortalizas", "cafe", "cacao"]


def sha(ruta: Path) -> str:
    return hashlib.sha256(ruta.read_bytes()).hexdigest()


def cargar_foto(ruta: Path, alto: int, ancho: int) -> np.ndarray:
    """Igual que la API: exif_transpose, RGB, resize directo bilineal, 0-1, NCHW."""
    img = ImageOps.exif_transpose(Image.open(ruta)).convert("RGB").resize((ancho, alto), Image.BILINEAR)
    return (np.asarray(img, dtype=np.float32) / 255.0).transpose(2, 0, 1)[None]


def listar_fotos(carpeta: Path | None, ids: list[str], maximo: int) -> list[tuple[Path, int | None]]:
    """[(foto, índice de clase o None)]. Solo usa fotos sin etiqueta o de clases de este modelo."""
    if not carpeta or not carpeta.exists():
        return []
    fotos = []
    for f in carpeta.rglob("*"):
        if f.suffix.lower() not in EXT:
            continue
        clase = f.parent.name if f.parent != carpeta else None
        if clase not in ids and clase:  # router: cafe_roya/ cuenta como "cafe"
            clase = next((c for c in ids if clase.startswith(c + "_")), clase)
        if clase in ids:
            fotos.append((f, ids.index(clase)))
        elif clase is None:
            fotos.append((f, None))
    random.Random(0).shuffle(fotos)
    return fotos[:maximo]


def lote(fotos, alto, ancho, n_aleatorio=16):
    if fotos:
        return [cargar_foto(f, alto, ancho) for f, _ in fotos]
    rng = np.random.default_rng(0)  # sin fotos: solo sirve para probar el script
    return [rng.random((1, 3, alto, ancho), dtype=np.float32) for _ in range(n_aleatorio)]


class Calibrador(CalibrationDataReader):
    def __init__(self, tensores):
        self.it = iter([{"imagen": t} for t in tensores])

    def get_next(self):
        return next(self.it, None)


def predecir(ruta: Path, tensores) -> np.ndarray:
    s = ort.InferenceSession(str(ruta), providers=["CPUExecutionProvider"])
    return np.concatenate([s.run(["logits"], {"imagen": t})[0] for t in tensores])


def softmax(x, t=1.0):
    e = np.exp((x - x.max(1, keepdims=True)) / t)
    return e / e.sum(1, keepdims=True)


def procesar(carpeta: Path, salida: Path, fotos_dir: Path | None, maximo: int, max_perdida: float) -> dict:
    man = json.loads((carpeta / "manifest.json").read_text(encoding="utf-8"))
    fp32 = carpeta / "model.onnx"
    if man.get("sha256") and sha(fp32) != man["sha256"]:
        raise SystemExit(f"{carpeta.name}: sha256 de model.onnx no coincide con el manifest")
    # El contrato pide id de texto; algunos manifests traen id numérico y el texto en "nombre".
    man["clases"] = [{**c, "id": c["nombre"]} if isinstance(c["id"], int) else c for c in man["clases"]]
    ids = [c["id"] for c in man["clases"]]
    alto, ancho = man["entrada"]["alto"], man["entrada"]["ancho"]
    fotos = listar_fotos(fotos_dir, ids, maximo)
    tensores = lote(fotos, alto, ancho)

    t = man.get("temperatura", 1.0)
    etiq = [(i, y) for i, (_, y) in enumerate(fotos) if y is not None]
    p32 = softmax(predecir(fp32, tensores), t)

    def comparar(ruta: Path) -> dict:
        p8 = softmax(predecir(ruta, tensores), t)
        c = {"coincidencia": round(float((p32.argmax(1) == p8.argmax(1)).mean()), 4),
             "dif_max_prob": round(float(np.abs(p32 - p8).max()), 4)}
        if etiq:
            idx, y = map(np.array, zip(*etiq))
            c["accuracy_fp32"] = round(float((p32[idx].argmax(1) == y).mean()), 4)
            c["accuracy_int8"] = round(float((p8[idx].argmax(1) == y).mean()), 4)
        # Pérdida = la peor entre caída de accuracy y desacuerdo con FP32 (con pocas fotos, la
        # accuracy sola engaña: un INT8 que cambia 1 de cada 3 respuestas puede "acertar más").
        caida = c.get("accuracy_fp32", 1) - c.get("accuracy_int8", 1)
        c["perdida"] = round(float(max(caida, 1 - c["coincidencia"])), 4)
        return c

    with tempfile.TemporaryDirectory() as tmp:
        prep = Path(tmp) / "prep.onnx"
        try:  # optimiza e infiere formas antes de cuantizar (requiere sympy)
            quant_pre_process(str(fp32), str(prep))
        except Exception as e:
            print(f"  aviso: sin pre-proceso ({e.__class__.__name__}); instala sympy")
            shutil.copyfile(fp32, prep)
        arreglar_gemm(prep)

        candidatos = {
            "dinamica_matmul": lambda o: quantize_dynamic(str(prep), str(o), weight_type=QuantType.QInt8,
                                                          op_types_to_quantize=["MatMul", "Gemm"]),
            "dinamica": lambda o: quantize_dynamic(str(prep), str(o), weight_type=QuantType.QUInt8),
        }
        if fotos:
            candidatos["estatica_qdq"] = lambda o: quantize_static(
                str(prep), str(o), Calibrador(tensores[:100]), quant_format=QuantFormat.QDQ,
                per_channel=True, activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8)

        probados, mejor = {}, None
        for metodo, cuantizar in candidatos.items():
            ruta = Path(tmp) / f"{metodo}.onnx"
            try:
                cuantizar(ruta)
                c = comparar(ruta) | {"tamano_mb": round(ruta.stat().st_size / 2**20, 2)}
            except Exception as e:
                probados[metodo] = {"error": str(e)[:200]}
                continue
            probados[metodo] = c
            ok = c["perdida"] <= max_perdida and c["tamano_mb"] < fp32.stat().st_size / 2**20 * 0.9
            if ok and (mejor is None or c["tamano_mb"] < probados[mejor[0]]["tamano_mb"]):
                mejor = (metodo, ruta)

        destino = salida / f"{man['nombre']}.onnx"
        shutil.copyfile(mejor[1] if mejor else fp32, destino)

    metodo = mejor[0] if mejor else None
    info = {
        "nombre": man["nombre"], "version": man.get("version"), "tipo": man.get("tipo"),
        "archivo": destino.name, "precision": "int8" if mejor else "fp32",
        "cuantizacion": metodo, "sha256": sha(destino),
        "tamano_mb": round(destino.stat().st_size / 2**20, 2),
        "tamano_fp32_mb": round(fp32.stat().st_size / 2**20, 2),
        "clases": man["clases"], "entrada": man["entrada"], "salidas": man.get("salidas"),
        "temperatura": t, "umbral": man.get("umbral", 0.6),
        "comparacion": {"n": len(tensores), "fotos_reales": bool(fotos), "metodos": probados},
    }
    for k in ("rechazo", "especialistas"):
        if k in man:
            info[k] = man[k]
    print(f"{man['nombre']:<11} {info['tamano_fp32_mb']:>7} MB → {info['tamano_mb']:>7} MB  "
          f"{metodo or 'FP32 (ningún INT8 cumplió)'}  n={len(tensores)}{'' if fotos else ' (aleatorio)'}")
    for m, c in probados.items():
        print(f"    {m:<16} {c}")
    return info


def arreglar_gemm(ruta: Path) -> None:
    """Gemm con transB=1 que comparten peso (TTA): onnxruntime los pasa a MatMul transponiendo el
    peso una vez por nodo y rompe el modelo. Se transpone una sola vez aquí y se deja transB=0."""
    import onnx
    from onnx import numpy_helper
    m = onnx.load(str(ruta))
    inits = {i.name: i for i in m.graph.initializer}
    hechos = {}
    for n in m.graph.node:
        tb = next((a for a in n.attribute if a.name == "transB"), None)
        if n.op_type != "Gemm" or not tb or tb.i != 1 or n.input[1] not in inits:
            continue
        w = n.input[1]
        if w not in hechos:
            hechos[w] = w + "_T"
            m.graph.initializer.append(numpy_helper.from_array(numpy_helper.to_array(inits[w]).T.copy(), hechos[w]))
        n.input[1], tb.i = hechos[w], 0
    if hechos:
        onnx.save(m, str(ruta))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modelos", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--fotos", type=Path)
    ap.add_argument("--max-fotos", type=int, default=200)
    ap.add_argument("--max-perdida", type=float, default=0.02, help="pérdida tolerada (0.02 = 2 puntos)")
    a = ap.parse_args()

    a.salida.mkdir(parents=True, exist_ok=True)
    carpetas = sorted((c for c in a.modelos.iterdir() if (c / "model.onnx").exists()),
                      key=lambda c: ORDEN.index(c.name) if c.name in ORDEN else 99)
    if not carpetas:
        raise SystemExit(f"No hay modelos en {a.modelos}")
    modelos = [procesar(c, a.salida, a.fotos, a.max_fotos, a.max_perdida) for c in carpetas]
    faltan = [n for n in ORDEN if n not in {m["nombre"] for m in modelos}]
    (a.salida / "modelos.json").write_text(json.dumps(
        {"contrato": "docs/contrato_modelos.md", "modelos": modelos, "faltan": faltan},
        indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Listo: {a.salida / 'modelos.json'}" + (f"  (faltan: {', '.join(faltan)})" if faltan else ""))


if __name__ == "__main__":
    main()
