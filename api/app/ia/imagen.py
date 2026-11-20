"""Lectura segura de la foto subida: tipo real por firma, tamaño, píxeles y orientación EXIF."""
import hashlib
import io
import warnings

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import ajustes


def _formato(datos: bytes) -> str | None:
    if datos.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if datos.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
        return "WEBP"
    return None


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

    Image.MAX_IMAGE_PIXELS = a.max_imagen_pixeles
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
    imagen = ImageOps.exif_transpose(imagen).convert("RGB")
    return imagen, datos, hashlib.sha256(datos).hexdigest()
