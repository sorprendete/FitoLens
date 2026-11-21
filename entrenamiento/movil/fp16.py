"""Pasa a media precisión (FP16) los modelos de la app que cuantizar.py dejó en FP32.
Entradas y salidas siguen en float32 (la app no cambia). Si FP16 pierde más de --max-perdida en las
fotos de muestra, ese modelo se queda en FP32. Uso, desde FitoLens/:
  python entrenamiento/movil/fp16.py --app app/assets/modelos --fotos modelos/muestras
"""
import argparse, json, sys
from pathlib import Path

import numpy as np
import onnx
from onnxconverter_common import float16

sys.path.insert(0, str(Path(__file__).parent))
from cuantizar import lote, listar_fotos, predecir, sha  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", type=Path, required=True)
    ap.add_argument("--fotos", type=Path, required=True)
    ap.add_argument("--max-fotos", type=int, default=200)
    ap.add_argument("--solo", nargs="*", help="nombres de modelos a convertir (por defecto, todos los FP32)")
    ap.add_argument("--max-perdida", type=float, default=0.01, help="0.01 = 1 punto")
    a = ap.parse_args()
    info = json.loads((a.app / "modelos.json").read_text())
    for m in info["modelos"]:
        if m["precision"] != "fp32" or (a.solo and m["nombre"] not in a.solo):
            continue
        ruta = a.app / m["archivo"]
        ids = [c["id"] for c in m["clases"]]
        fotos = [f for f in listar_fotos(a.fotos, ids, a.max_fotos) if f[1] is not None]
        t = lote(fotos, m["entrada"]["alto"], m["entrada"]["ancho"])
        y = np.array([c for _, c in fotos])
        p32 = predecir(ruta, t).argmax(1)
        tmp = ruta.with_suffix(".fp16.onnx")
        p16 = None
        for bloqueo in ([], ["Cast"]):  # los ensambles traen Cast internos que el conversor rompe
            lista = float16.DEFAULT_OP_BLOCK_LIST + bloqueo
            onnx.save(float16.convert_float_to_float16(onnx.load(str(ruta)), keep_io_types=True, op_block_list=lista), str(tmp))
            try:
                p16 = predecir(tmp, t).argmax(1); break
            except Exception as e:
                print(m["nombre"], "FP16 no corre", bloqueo, str(e)[:120])
        if p16 is None:
            tmp.unlink(); continue
        acc32, acc16 = float((p32 == y).mean()), float((p16 == y).mean())
        r = {"n": len(y), "accuracy_fp32": round(acc32, 4), "accuracy_fp16": round(acc16, 4),
             "perdida": round(acc32 - acc16, 4), "coincidencia": round(float((p32 == p16).mean()), 4),
             "tamano_mb": round(tmp.stat().st_size / 1e6, 2)}
        m.setdefault("comparacion", {}).setdefault("metodos", {})["fp16"] = r
        if acc32 - acc16 <= a.max_perdida:
            tmp.replace(ruta)
            m.update(precision="fp16", cuantizacion="fp16", sha256=sha(ruta), tamano_mb=r["tamano_mb"])
        else:
            tmp.unlink()
        print(f'{m["nombre"]:12} {m["precision"]}  {r}')
    (a.app / "modelos.json").write_text(json.dumps(info, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
