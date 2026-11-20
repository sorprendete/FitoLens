"""Genera el QR del stand: python generar_qr.py https://fitolens.ejemplo.pe [salida.png]
Requiere: pip install "qrcode[pil]"
"""
import sys

import qrcode
from PIL import Image, ImageDraw, ImageFont

url = sys.argv[1]
salida = sys.argv[2] if len(sys.argv) > 2 else "qr_stand.png"

qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=24, border=2)
qr.add_data(url)
img_qr = qr.make_image(fill_color="#14532d", back_color="white").convert("RGB")

ancho = img_qr.width
lienzo = Image.new("RGB", (ancho, ancho + 320), "white")
lienzo.paste(img_qr, (0, 160))
d = ImageDraw.Draw(lienzo)


def fuente(tam):
    for f in ("DejaVuSans-Bold.ttf", "arialbd.ttf", "Arial Bold.ttf"):
        try:
            return ImageFont.truetype(f, tam)
        except OSError:
            pass
    return ImageFont.load_default()


def centrado(texto, y, tam, color):
    f = fuente(tam)
    w = d.textlength(texto, font=f)
    d.text(((ancho - w) / 2, y), texto, font=f, fill=color)


centrado("FitoLens", 30, 96, "#14532d")
centrado("Escanea y diagnostica tu cultivo", ancho + 170, 44, "#1f2937")
centrado(url.replace("https://", "").replace("http://", ""), ancho + 240, 32, "#6b7280")
lienzo.save(salida, dpi=(300, 300))
print("QR guardado en", salida)
