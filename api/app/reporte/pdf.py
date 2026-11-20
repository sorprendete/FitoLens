"""Reporte PDF de un diagnóstico (A4, una página) para entregar al agricultor o a la agencia agraria."""
import io
from datetime import datetime, timedelta, timezone

from fpdf import FPDF
from PIL import Image

from app.db.modelos import Diagnostico
from app.reporte.consejos import CLASES, CULTIVOS, DESCONOCIDA

PERU = timezone(timedelta(hours=-5))  # Perú no cambia de hora en el año
VERDE, OSCURO, GRIS = (16, 122, 87), (20, 33, 28), (100, 112, 106)
URGENCIA = {  # (texto, color)
    "ninguna": ("Sin tratamiento", (16, 122, 87)),
    "media": ("Actuar esta semana", (181, 128, 0)),
    "alta": ("Actuar en 1 o 2 días", (214, 96, 26)),
    "critica": ("Actuar hoy", (200, 40, 40)),
}
PROVINCIAS = {
    "bellavista": "Bellavista", "el_dorado": "El Dorado", "huallaga": "Huallaga", "lamas": "Lamas",
    "mariscal_caceres": "Mariscal Cáceres", "moyobamba": "Moyobamba", "picota": "Picota", "rioja": "Rioja",
    "san_martin": "San Martín", "tocache": "Tocache",
}


def _texto(t: str) -> str:
    """Las fuentes base del PDF solo tienen Latin-1: se cambia lo que no entra."""
    return t.replace("–", "-").replace("—", "-").encode("latin-1", "replace").decode("latin-1")


def _ubicacion(d: Diagnostico) -> str:
    partes = []
    if d.provincia:
        partes.append(f"Provincia {PROVINCIAS.get(d.provincia, d.provincia)}, San Martín")
    if d.latitud is not None and d.longitud is not None:
        partes.append(f"GPS {d.latitud:.5f}, {d.longitud:.5f}")
    return "\n".join(partes) or "No indicada"


def _foto_jpeg(foto: Image.Image, lado: int = 900) -> io.BytesIO:
    f = foto.copy()
    f.thumbnail((lado, lado))
    buf = io.BytesIO()
    f.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return buf


def generar(d: Diagnostico, foto: Image.Image) -> bytes:
    nombre, agente, consejo, urgencia = CLASES.get(d.clase or "", DESCONOCIDA)
    nombre = nombre or (d.clase or "").split("_", 1)[-1].replace("_", " ").capitalize()
    urg_texto, urg_color = URGENCIA.get(urgencia, URGENCIA["media"])
    creado = d.creado if d.creado.tzinfo else d.creado.replace(tzinfo=timezone.utc)
    fecha = creado.astimezone(PERU).strftime("%d/%m/%Y %H:%M (hora de Perú)")

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(False)
    pdf.set_title(_texto(f"FitoLens - Reporte N° {d.id}"))
    pdf.set_author("FitoLens")
    pdf.add_page()

    # Cabecera
    pdf.set_fill_color(*VERDE)
    pdf.rect(0, 0, 210, 32, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(15, 8)
    pdf.set_font("Helvetica", "B", 24)
    pdf.cell(0, 10, "FitoLens")
    pdf.set_xy(15, 19)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 6, _texto("Reporte de diagnóstico de enfermedades en cultivos"))
    pdf.set_xy(130, 11)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(65, 6, _texto(f"Reporte N° {d.id:06d}"), align="R")
    pdf.set_xy(130, 18)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(65, 6, _texto(fecha), align="R")

    # Foto (izquierda) y datos (derecha)
    ancho_foto = 80
    alto_foto = min(ancho_foto * foto.height / foto.width, 100)
    pdf.image(_foto_jpeg(foto), x=15, y=42, w=alto_foto * foto.width / foto.height, h=alto_foto)

    x, y = 102, 42
    pdf.set_text_color(*GRIS)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_xy(x, y)
    pdf.cell(0, 5, _texto("CULTIVO: " + CULTIVOS.get(d.cultivo or "", d.cultivo or "-").upper()))
    pdf.set_text_color(*(VERDE if urgencia == "ninguna" else urg_color))
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_xy(x, y + 7)
    pdf.multi_cell(93, 9, _texto(nombre))
    if agente:
        pdf.set_text_color(*GRIS)
        pdf.set_font("Helvetica", "I", 11)
        pdf.set_x(x)
        pdf.multi_cell(93, 6, _texto(agente))

    filas = [
        ("Confianza", f"{round((d.confianza or 0) * 100)} %"),
        ("Urgencia", urg_texto),
        ("Fecha", fecha),
        ("Ubicación", _ubicacion(d)),
        ("Origen", {"web": "Página web", "bot": "Telegram", "app": "App móvil"}.get(d.origen, d.origen)),
    ]
    pdf.ln(3)
    for etiqueta, valor in filas:
        pdf.set_x(x)
        pdf.set_text_color(*GRIS)
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(24, 6, _texto(etiqueta))
        pdf.set_text_color(*OSCURO)
        pdf.set_font("Helvetica", "B", 10)
        pdf.multi_cell(69, 6, _texto(valor))

    # Barra de confianza
    yb = pdf.get_y() + 3
    pdf.set_fill_color(225, 232, 228)
    pdf.rect(x, yb, 93, 3, "F")
    pdf.set_fill_color(*VERDE)
    pdf.rect(x, yb, 93 * max(0.0, min(1.0, d.confianza or 0)), 3, "F")

    # Qué hacer
    y = max(42 + alto_foto, yb + 3) + 12
    pdf.set_draw_color(*VERDE)
    pdf.set_line_width(0.6)
    pdf.line(15, y, 195, y)
    pdf.set_xy(15, y + 4)
    pdf.set_text_color(*VERDE)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 7, _texto("Qué hacer"))
    pdf.ln(9)
    pdf.set_text_color(*OSCURO)
    pdf.set_font("Helvetica", "", 12)
    pdf.multi_cell(180, 7, _texto(consejo))
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*GRIS)
    pdf.multi_cell(180, 5.5, _texto(
        "Dosis: sigue siempre la etiqueta del producto registrado en SENASA. Usa equipo de protección "
        "y respeta el periodo de carencia antes de cosechar."))

    # Firma y pie
    pdf.set_xy(15, 245)
    pdf.set_draw_color(*GRIS)
    pdf.set_line_width(0.2)
    pdf.line(15, 250, 85, 250)
    pdf.line(125, 250, 195, 250)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_xy(15, 251)
    pdf.cell(70, 5, "Agricultor", align="C")
    pdf.set_xy(125, 251)
    pdf.cell(70, 5, _texto("Técnico o agencia agraria"), align="C")

    pdf.set_xy(15, 268)
    pdf.set_font("Helvetica", "I", 8.5)
    pdf.multi_cell(180, 4.5, _texto(
        "Orientación de apoyo generada por inteligencia artificial. No reemplaza la visita de un agrónomo. "
        f"Modelo {d.modelo_version}. Huella de la foto (SHA-256): {d.imagen_sha256[:16]}..."), align="C")
    return bytes(pdf.output())
