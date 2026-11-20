"""validar.py <modelos_fp32> <muestras> nombre=ruta.onnx ...  -> coincidencia con FP32 y precision en fotos reales.
Con 'fp16b:nombre' intenta FP16 bloqueando operaciones problematicas."""
import json, sys
from pathlib import Path
import numpy as np, onnx, onnxruntime as ort
from PIL import Image, ImageOps

FP32, MUESTRAS = Path(sys.argv[1]), Path(sys.argv[2])
fotos = sorted(MUESTRAS.rglob("*.jpg"))

def cargar(p, alto, ancho):
    im = ImageOps.exif_transpose(Image.open(p)).convert("RGB").resize((ancho, alto), Image.BILINEAR)
    return (np.asarray(im, dtype=np.float32) / 255.0).transpose(2, 0, 1)[None]

def pred(s, x, sal):
    if "float16" in s.get_inputs()[0].type: x = x.astype(np.float16)
    return int(np.argmax(s.run([sal], {s.get_inputs()[0].name: x})[0][0]))

for arg in sys.argv[3:]:
    nombre, ruta = arg.split("=", 1)
    man = json.loads((FP32 / nombre / "manifest.json").read_text(encoding="utf-8"))
    clases = [c["nombre"] for c in man["clases"]]
    alto, ancho, sal = man["entrada"]["alto"], man["entrada"]["ancho"], man["salidas"]["logits"]
    if ruta.startswith("fp16b"):
        from onnxconverter_common import float16
        m = float16.convert_float_to_float16(onnx.load(str(FP32 / nombre / "model.onnx")), keep_io_types=True,
            op_block_list=float16.DEFAULT_OP_BLOCK_LIST + ["Resize", "Upsample", "Range", "ConstantOfShape", "Where", "Expand", "Pow", "ReduceMean", "Sqrt", "Div", "Erf", "Identity"])
        ruta = str(Path(sys.argv[2]).parent / "candidatos" / f"{nombre}_fp16b.onnx"); onnx.save(m, ruta)
    s32 = ort.InferenceSession(str(FP32 / nombre / "model.onnx"), providers=["CPUExecutionProvider"])
    try:
        s = ort.InferenceSession(ruta, providers=["CPUExecutionProvider"])
    except Exception as e:
        print(nombre, ruta, "ERROR", str(e)[:300]); continue
    xs = [cargar(p, alto, ancho) for p in fotos]
    r = [pred(s32, x, sal) for x in xs]; c = [pred(s, x, sal) for x in xs]
    propias = [i for i, p in enumerate(fotos) if p.parent.name in clases]
    acc = lambda v: round(sum(clases[v[i]] == fotos[i].parent.name for i in propias) / max(1, len(propias)), 3)
    print(f"{nombre:11s} {Path(ruta).stat().st_size/2**20:6.1f} MB  coincide={sum(a==b for a,b in zip(r,c))/len(r):.3f}  acc_fp32={acc(r)} acc={acc(c)} n={len(propias)}")

