"""Convierte el CAM de una clase en una capa PNG RGBA (solo color, con transparencia) del encuadre de la foto."""
import base64
import io

import numpy as np
from PIL import Image, ImageFilter

LADO_MAXIMO = 512
# Paleta azul → cian → verde → amarillo → rojo
_PUNTOS = np.array([0.0, 0.25, 0.5, 0.75, 1.0])
_COLORES = np.array([[0, 0, 255], [0, 255, 255], [0, 255, 0], [255, 255, 0], [255, 0, 0]], dtype=np.float32)


def normalizar(cam: np.ndarray) -> np.ndarray:
    cam = np.maximum(cam, 0)
    rango = cam.max() - cam.min()
    return (cam - cam.min()) / rango if rango > 1e-8 else np.zeros_like(cam)


def fraccion_dentro(cam: np.ndarray, mascara: np.ndarray) -> float:
    """Qué parte de la atención del modelo cae dentro de la hoja ubicada (0-1)."""
    v = np.asarray(Image.fromarray(normalizar(cam).astype(np.float32), "F")
                   .resize(mascara.shape[::-1], Image.BILINEAR), dtype=np.float32)
    total = float(v.sum())
    return float(v[mascara].sum()) / total if total > 1e-8 else 0.0


def _mascara_suave(mascara: np.ndarray, tam: tuple[int, int]) -> np.ndarray:
    """Máscara al tamaño del mapa, un poco ampliada y con borde difuminado: no corta lesiones del borde."""
    m = Image.fromarray(mascara.astype(np.uint8) * 255).resize(tam, Image.BILINEAR)
    lado = max(3, (max(tam) // 60) | 1)  # ~1.5 % del lado, impar
    m = m.filter(ImageFilter.MaxFilter(lado)).filter(ImageFilter.GaussianBlur(lado / 2))
    return np.asarray(m, dtype=np.float32) / 255.0


def png_base64(cam: np.ndarray, ancho: int, alto: int, mascara: np.ndarray | None = None) -> str:
    """mascara (bool, cualquier tamaño, mismo encuadre): si viene, el color solo cubre la hoja."""
    escala = min(1.0, LADO_MAXIMO / max(ancho, alto))
    tam = (max(1, round(ancho * escala)), max(1, round(alto * escala)))
    mapa = Image.fromarray((normalizar(cam) * 255).astype(np.uint8)).resize(tam, Image.BILINEAR)
    v = np.asarray(mapa, dtype=np.float32) / 255.0
    if mascara is not None:
        v = v * _mascara_suave(mascara, tam)
        if v.max() > 1e-6:
            v = v / v.max()  # la zona más mirada dentro de la hoja queda en rojo
    rgb = np.stack([np.interp(v, _PUNTOS, _COLORES[:, i]) for i in range(3)], axis=-1)
    alfa = np.clip(v * 1.2 - 0.15, 0, 0.75) * 255  # zonas frías transparentes
    rgba = np.dstack([rgb, alfa]).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()
