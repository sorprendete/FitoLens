"""Verificador abierto (CLIP ViT-B/32, zero-shot) para rechazar plantas que no son cultivos de FitoLens.

El reconocedor de cultivo (router) solo conoce 8 cultivos + "otra planta" + "no es planta"; ante plantas que nunca vio
(coco, palma aceitera, plátano, yuca, arroz...) puede estar muy seguro de un cultivo equivocado. CLIP compara la foto
con descripciones de texto: 8 de cultivos soportados y varias de plantas y objetos ajenos. Si la probabilidad sumada
de los cultivos es baja, la foto se rechaza.

Archivos en <modelos>/verificador/: vision_model_quantized.onnx (Xenova/clip-vit-base-patch32), texto_embeds.npy
(embeddings normalizados de las descripciones, calculados una vez) y verificador.json ({"n_cultivos": 8}).
Medido con ~580 fotos (pruebas/ood): con umbral 0.25 acepta 100 % de las fotos de cultivos que el router admite y sube
el rechazo de plantas tropicales ajenas de 62 % a 90 %.
"""
import json
import logging
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

log = logging.getLogger("fitolens.verificador")
_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
_STD = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)


class Verificador:
    def __init__(self, carpeta: Path, hilos: int = 2):
        opciones = ort.SessionOptions()
        opciones.intra_op_num_threads = hilos
        opciones.inter_op_num_threads = 1
        self.sesion = ort.InferenceSession(str(carpeta / "vision_model_quantized.onnx"), opciones,
                                           providers=["CPUExecutionProvider"])
        self.salida = [o.name for o in self.sesion.get_outputs()].index("image_embeds")
        self.textos = np.load(carpeta / "texto_embeds.npy").astype(np.float32)
        self.n_cultivos = int(json.loads((carpeta / "verificador.json").read_text())["n_cultivos"])

    def prob_cultivo(self, imagen: Image.Image) -> float:
        """Probabilidad (0-1) de que la foto sea de alguno de los cultivos soportados según CLIP."""
        img = imagen.convert("RGB")
        w, h = img.size
        s = 224 / min(w, h)
        img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
        w, h = img.size
        izq, arr = (w - 224) // 2, (h - 224) // 2
        x = (np.asarray(img.crop((izq, arr, izq + 224, arr + 224)), np.float32) / 255 - _MEAN) / _STD
        v = self.sesion.run(None, {"pixel_values": x.transpose(2, 0, 1)[None]})[self.salida][0]
        v = v / np.linalg.norm(v)
        z = 100.0 * (self.textos @ v)
        p = np.exp(z - z.max())
        p /= p.sum()
        return float(p[: self.n_cultivos].sum())


_cache: dict[str, Verificador | None] = {}


def cargar(carpeta: Path) -> Verificador | None:
    """Carga el verificador una vez por proceso; None si no está instalado (el sistema sigue funcionando sin él)."""
    clave = str(carpeta)
    if clave not in _cache:
        try:
            _cache[clave] = Verificador(carpeta) if (carpeta / "vision_model_quantized.onnx").exists() else None
            if _cache[clave]:
                log.info("Verificador abierto cargado desde %s", carpeta)
        except Exception:
            log.exception("No se pudo cargar el verificador")
            _cache[clave] = None
    return _cache[clave]
