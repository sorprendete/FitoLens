"""Un modelo ONNX con su manifest. Solo sabe preprocesar una foto y devolver logits y CAM."""
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

from app.ia.manifest import Manifest


class ModeloInvalido(Exception):
    pass


@dataclass
class Salida:
    logits: np.ndarray  # [K]
    cam: np.ndarray | None  # [K, h, w]


class ModeloOnnx:
    def __init__(self, carpeta: Path, hilos: int = 2):
        self.carpeta = carpeta
        self.manifest = Manifest.model_validate_json((carpeta / "manifest.json").read_text())
        ruta = carpeta / "model.onnx"
        sha = hashlib.sha256(ruta.read_bytes()).hexdigest()
        if sha != self.manifest.sha256:
            raise ModeloInvalido(f"{carpeta.name}: el SHA-256 de model.onnx no coincide con el manifest")
        metricas = carpeta / "metricas.json"
        self.metricas = json.loads(metricas.read_text()) if metricas.exists() else {}

        opciones = ort.SessionOptions()
        opciones.intra_op_num_threads = hilos
        opciones.inter_op_num_threads = 1
        self.sesion = ort.InferenceSession(str(ruta), opciones, providers=["CPUExecutionProvider"])
        self.entrada = self.sesion.get_inputs()[0].name
        nombres = {s.name for s in self.sesion.get_outputs()}
        self.salida_cam = self.manifest.salidas.cam if self.manifest.salidas.cam in nombres else None

    @property
    def version(self) -> str:
        return f"{self.manifest.nombre}@{self.manifest.version}"

    def preprocesar(self, imagen: Image.Image) -> np.ndarray:
        """RGB, redimensión directa bilineal (sin recorte), rango 0-1, [1, 3, H, W]."""
        e = self.manifest.entrada
        x = np.asarray(imagen.convert("RGB").resize((e.ancho, e.alto), Image.BILINEAR), dtype=np.float32)
        return (x / 255.0).transpose(2, 0, 1)[None]

    def predecir(self, imagen: Image.Image) -> Salida:
        salidas = [self.manifest.salidas.logits] + ([self.salida_cam] if self.salida_cam else [])
        resultado = self.sesion.run(salidas, {self.entrada: self.preprocesar(imagen)})
        return Salida(logits=resultado[0][0], cam=resultado[1][0] if self.salida_cam else None)


def softmax(logits: np.ndarray, temperatura: float) -> np.ndarray:
    z = logits / temperatura
    e = np.exp(z - z.max())
    return e / e.sum()
