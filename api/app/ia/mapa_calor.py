"""Convierte el CAM de una clase en una capa PNG RGBA (solo color, con transparencia) del encuadre de la foto."""
import base64
import io

import numpy as np
from PIL import Image

LADO_MAXIMO = 512
# Paleta azul → cian → verde → amarillo → rojo
_PUNTOS = np.array([0.0, 0.25, 0.5, 0.75, 1.0])
_COLORES = np.array([[0, 0, 255], [0, 255, 255], [0, 255, 0], [255, 255, 0], [255, 0, 0]], dtype=np.float32)


def normalizar(cam: np.ndarray) -> np.ndarray:
    cam = np.maximum(cam, 0)
    rango = cam.max() - cam.min()
    return (cam - cam.min()) / rango if rango > 1e-8 else np.zeros_like(cam)


def png_base64(cam: np.ndarray, ancho: int, alto: int) -> str:
    escala = min(1.0, LADO_MAXIMO / max(ancho, alto))
    tam = (max(1, round(ancho * escala)), max(1, round(alto * escala)))
    mapa = Image.fromarray((normalizar(cam) * 255).astype(np.uint8)).resize(tam, Image.BILINEAR)
    v = np.asarray(mapa, dtype=np.float32) / 255.0
    rgb = np.stack([np.interp(v, _PUNTOS, _COLORES[:, i]) for i in range(3)], axis=-1)
    alfa = np.clip(v * 1.2 - 0.15, 0, 0.75) * 255  # zonas frías transparentes
    rgba = np.dstack([rgb, alfa]).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()
