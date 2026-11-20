"""Genera modelos ONNX falsos que cumplen docs/contrato_modelos.md.

Sirven para desarrollar la web, el bot y los tests sin esperar a los modelos reales.
Uso:  python scripts/crear_modelos_falsos.py ../modelos
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

LADO = 64

CLASES = {
    "router": [("pimiento", None), ("papa", None), ("tomate", None), ("cafe", None),
               ("cacao", None), ("maiz", None), ("limon", None), ("naranja", None), ("otra_planta", None), ("no_planta", None)],
    "hortalizas": [("pimiento_sana", "pimiento"), ("pimiento_mancha_bacteriana", "pimiento"),
                   ("papa_sana", "papa"), ("papa_tizon_temprano", "papa"), ("papa_tizon_tardio", "papa"),
                   ("tomate_sana", "tomate"), ("tomate_tizon_tardio", "tomate"), ("tomate_mosaico", "tomate")],
    "cafe": [("cafe_sana", "cafe"), ("cafe_roya", "cafe"), ("cafe_ojo_de_gallo", "cafe")],
    "cacao": [("cacao_sana", "cacao"), ("cacao_monilia", "cacao"), ("cacao_mazorca_negra", "cacao")],
    "maiz": [(c, "maiz") for c in ("maiz_sana", "maiz_tizon_hoja", "maiz_roya_comun", "maiz_mancha_gris",
                                    "maiz_gusano_cogollero")],
    "citricos": [(f"{cult}_{e}", cult) for cult in ("limon", "naranja")
                 for e in ("sana", "cancrosis", "hlb", "mancha_negra", "melanosis", "sarna", "fumagina", "minador")],
}


def grafo_onnx(k: int, sesgo: np.ndarray, semilla: int) -> bytes:
    """imagen [N,3,H,W] → AveragePool → Conv 1x1 (= cam [N,K,h,w]) → GAP → logits [N,K]."""
    rng = np.random.default_rng(semilla)
    pesos = numpy_helper.from_array(rng.normal(0, 1, (k, 3, 1, 1)).astype(np.float32), "W")
    bias = numpy_helper.from_array(sesgo.astype(np.float32), "B")
    nodos = [
        helper.make_node("AveragePool", ["imagen"], ["p"], kernel_shape=[8, 8], strides=[8, 8]),
        helper.make_node("Conv", ["p", "W", "B"], ["cam"]),
        helper.make_node("GlobalAveragePool", ["cam"], ["g"]),
        helper.make_node("Flatten", ["g"], ["logits"]),
    ]
    g = helper.make_graph(
        nodos, "falso",
        [helper.make_tensor_value_info("imagen", TensorProto.FLOAT, ["N", 3, LADO, LADO])],
        [helper.make_tensor_value_info("logits", TensorProto.FLOAT, ["N", k]),
         helper.make_tensor_value_info("cam", TensorProto.FLOAT, ["N", k, LADO // 8, LADO // 8])],
        [pesos, bias],
    )
    modelo = helper.make_model(g, opset_imports=[helper.make_opsetid("", 17)])
    modelo.ir_version = 8
    onnx.checker.check_model(modelo)
    return modelo.SerializeToString()


def crear(carpeta: Path, nombre: str, favorita: str | None = None, umbral: float = 0.3) -> None:
    """`favorita`: clase a la que el modelo da mucha más probabilidad (para tests deterministas)."""
    clases = CLASES[nombre]
    ids = [c for c, _ in clases]
    sesgo = np.zeros(len(ids))
    if favorita:
        sesgo[ids.index(favorita)] = 10.0
    datos = grafo_onnx(len(ids), sesgo, semilla=len(nombre))
    destino = carpeta / nombre
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "model.onnx").write_bytes(datos)
    manifest = {
        "nombre": nombre, "version": "0.0.1-falso",
        "tipo": "router" if nombre == "router" else "especialista",
        "backbone": "falso",
        "clases": [{"id": c, "nombre": c.split("_", 1)[-1], "cultivo": cult} for c, cult in clases],
        "entrada": {"alto": LADO, "ancho": LADO, "formato": "RGB", "rango": [0, 1], "redimension": "directa"},
        "salidas": {"logits": "logits", "cam": "cam"},
        "temperatura": 1.0, "umbral": umbral,
        "sha256": hashlib.sha256(datos).hexdigest(),
        "entrenado": {"fecha": "2026-11-20", "datasets": ["ninguno: modelo falso"]},
    }
    (destino / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    n = len(ids)
    metricas = {"campo": {"accuracy": 0.0, "f1_macro": 0.0, "n": 0, "matriz_confusion": [[0] * n] * n},
                "laboratorio": {"accuracy": 0.0}, "latencia_ms": 1}
    (destino / "metricas.json").write_text(json.dumps(metricas, indent=2))


def crear_todos(carpeta: Path, cultivo_router: str = "tomate") -> None:
    crear(carpeta, "router", favorita=cultivo_router)
    crear(carpeta, "hortalizas", favorita="tomate_tizon_tardio")
    crear(carpeta, "cafe", favorita="cafe_roya")
    crear(carpeta, "cacao", favorita="cacao_monilia")
    crear(carpeta, "maiz", favorita="maiz_gusano_cogollero")
    crear(carpeta, "citricos", favorita="naranja_hlb")


if __name__ == "__main__":
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else "../modelos")
    crear_todos(destino)
    print(f"Modelos falsos creados en {destino.resolve()}")
