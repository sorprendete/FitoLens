"""Lectura segura de la foto subida: tipo real por firma, tamaño, píxeles y orientación EXIF."""
import hashlib
import io
import warnings

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import ajustes

MAX_RESOLUCION = 512


def _formato(datos: bytes) -> str | None:
    if datos.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if datos.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
        return "WEBP"
    return None


def reducir(imagen: Image.Image, max_lado: int = MAX_RESOLUCION) -> Image.Image:
    """Reduce la foto a la resolución máxima que usan modelos y segmentación."""
    if max(imagen.size) > max_lado:
        imagen.thumbnail((max_lado, max_lado), Image.BILINEAR)
    return imagen


def _decodificar(datos: bytes, max_pixeles: int) -> Image.Image:
    Image.MAX_IMAGE_PIXELS = max_pixeles
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            Image.open(io.BytesIO(datos)).verify()
            imagen = Image.open(io.BytesIO(datos))
            imagen.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(400, "La imagen tiene demasiados píxeles.")
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise HTTPException(400, "La imagen está dañada o no es válida.")

    # Las fotos de celular vienen giradas en EXIF: se endereza antes de diagnosticar.
    imagen = ImageOps.exif_transpose(imagen)
    reducir(imagen, MAX_RESOLUCION)
    return imagen.convert("RGB")


async def leer(archivo: UploadFile) -> tuple[Image.Image, bytes, str]:
    """Devuelve (imagen RGB, bytes originales, sha256)."""
    a = ajustes()
    limite = int(a.max_imagen_mb * 1024 * 1024)
    datos = await archivo.read(limite + 1)
    if not datos:
        raise HTTPException(400, "El archivo está vacío.")
    if len(datos) > limite:
        raise HTTPException(413, f"La imagen supera el máximo de {a.max_imagen_mb:g} MB.")
    if _formato(datos) is None:
        raise HTTPException(415, "Formato no permitido. Usa JPG, PNG o WebP.")

    # Decodificación y redimensión en threadpool para no bloquear el bucle async
    imagen = await run_in_threadpool(_decodificar, datos, a.max_imagen_pixeles)
    sha = hashlib.sha256(datos).hexdigest()
    return imagen, datos, sha
