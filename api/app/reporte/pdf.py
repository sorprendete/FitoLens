"""Reporte PDF de un diagnóstico fitosanitario (A4, exactamente una sola página).

Diseñado para entregarse al agricultor o a la agencia agraria en web, bot y app móvil.
Cumple estrictamente con la regla de 1 sola página A4 mediante medición previa,
auto-ajuste de fuentes, truncado seguro con '...' y desactivación de auto-page-break.
"""
import base64
import io
import math
import re
from datetime import datetime, timedelta, timezone

import numpy as np
from fpdf import FPDF
from PIL import Image

from app.db.modelos import Diagnostico
from app.reporte.consejos import CLASES, CULTIVOS, DESCONOCIDA

PERU = timezone(timedelta(hours=-5))  # San Martín / Perú no cambia de hora

# Paleta de identidad FitoLens (acento de la web, navy y neutros)
ACENTO = (8, 145, 178)          # Cyan web (#0891b2)
ACENTO_CLARO = (56, 189, 248)    # Cyan brillante (#38bdf8)
NAVY_CABECERA = (11, 19, 41)     # Navy oscuro (#0b1329)
TEXTO_OSCURO = (30, 41, 59)      # Slate 800 (#1e293b)
TEXTO_GRIS = (100, 116, 139)     # Slate 500 (#64748b)
FONDO_TARJETA = (248, 250, 252)  # Slate 50 (#f8fafc)
BORDE_SUAVE = (226, 232, 240)    # Slate 200 (#e2e8f0)
COLOR_SANA = (5, 150, 105)       # Verde esmeralda (#059669)

# Niveles de urgencia: (texto, color_texto, color_fondo)
URGENCIA = {
    "ninguna": ("Sin tratamiento necesario", (5, 150, 105), (236, 253, 245)),
    "media": ("Actuar esta semana", (217, 119, 6), (254, 243, 199)),
    "alta": ("Actuar en 1 o 2 días", (234, 88, 12), (255, 237, 213)),
    "critica": ("Actuar hoy urgente", (220, 38, 38), (254, 226, 226)),
}

PROVINCIAS = {
    "bellavista": "Bellavista", "el_dorado": "El Dorado", "huallaga": "Huallaga", "lamas": "Lamas",
    "mariscal_caceres": "Mariscal Cáceres", "moyobamba": "Moyobamba", "picota": "Picota", "rioja": "Rioja",
    "san_martin": "San Martín", "tocache": "Tocache",
}

DOMINIO_DEFECTO = "https://fitolens.5-253-232-122.sslip.io"


def _obtener_url_sitio() -> str:
    """Obtiene la URL pública del sitio desde la configuración si existe; si no, el dominio real por defecto."""
    try:
        from app.core.config import ajustes
        a = ajustes()
        for attr in ("url_publica", "dominio", "dominio_publico", "url_sitio", "url_base"):
            val = getattr(a, attr, None)
            if val:
                return str(val).rstrip("/")
    except Exception:
        pass
    return DOMINIO_DEFECTO


URL_SITIO = _obtener_url_sitio()


def _limpiar(t: str | None) -> str:
    """Convierte caracteres Unicode a su equivalente Latin-1 para fuentes estándar de FPDF."""
    if not t:
        return ""
    reemplazos = {
        "–": "-", "—": "-", "•": "-", "“": '"', "”": '"',
        "‘": "'", "’": "'", "…": "...", "°": "o", "²": "2",
        "³": "3", "±": "+/-", "×": "x", "\u200b": "", "\xa0": " ",
    }
    for orig, rep in reemplazos.items():
        t = t.replace(orig, rep)
    return t.encode("latin-1", "replace").decode("latin-1")


def _ubicacion(d: Diagnostico) -> str:
    partes = []
    if d.provincia:
        partes.append(f"Provincia {PROVINCIAS.get(d.provincia, d.provincia)}, San Martín")
    if d.latitud is not None and d.longitud is not None:
        partes.append(f"GPS {d.latitud:.4f}, {d.longitud:.4f}")
    return ", ".join(partes) or "San Martín (provincia no indicada)"


def _preparar_foto_fija(foto: Image.Image, ancho_mm: float = 88, alto_mm: float = 50, dpi: int = 150) -> io.BytesIO:
    """Ajusta la imagen a un marco fijo (ancho x alto en mm) sin deformarla, con fondo neutro."""
    w_px = max(10, int(ancho_mm * dpi / 25.4))
    h_px = max(10, int(alto_mm * dpi / 25.4))
    lienzo = Image.new("RGB", (w_px, h_px), (241, 245, 249))
    im = foto.copy().convert("RGB")
    im.thumbnail((w_px, h_px), Image.Resampling.LANCZOS)
    x = (w_px - im.width) // 2
    y = (h_px - im.height) // 2
    lienzo.paste(im, (x, y))
    buf = io.BytesIO()
    lienzo.save(buf, format="JPEG", quality=88)
    buf.seek(0)
    return buf


def _obtener_mapa_calor(foto: Image.Image, d: Diagnostico, mapa_calor: Image.Image | bytes | str | None) -> Image.Image | None:
    """Resuelve el mapa de calor REAL del modelo superpuesto a la foto. Si no hay, devuelve None (nunca se inventa)."""
    try:
        if isinstance(mapa_calor, str):
            mapa_img = Image.open(io.BytesIO(base64.b64decode(mapa_calor)))
        elif isinstance(mapa_calor, bytes):
            mapa_img = Image.open(io.BytesIO(mapa_calor))
        elif isinstance(mapa_calor, Image.Image):
            mapa_img = mapa_calor
        else:
            return None
    except Exception:
        return None

    if mapa_img.mode == "RGBA":
        if mapa_img.size != foto.size:
            mapa_img = mapa_img.resize(foto.size, Image.Resampling.BILINEAR)
        return Image.alpha_composite(foto.convert("RGBA"), mapa_img).convert("RGB")
    return mapa_img.convert("RGB")


def _ajustar_texto_multicell(
    pdf: FPDF,
    texto: str,
    ancho_max: float,
    tamanos: list[float],
    familia: str = "Helvetica",
    estilo: str = "",
    max_lineas: int = 2,
) -> tuple[float, str, int]:
    """Ajusta un texto para que quepa en como máximo `max_lineas` dentro de `ancho_max`.

    Prueba tamaños de fuente decrecientes. Si en el menor tamaño aún excede `max_lineas`,
    recorta la última línea con '...' midiendo con `pdf.get_string_width`.
    Devuelve (tamano_elegido, texto_con_saltos_linea, num_lineas).
    """
    texto = " ".join((texto or "").strip().split())
    if not texto:
        return tamanos[-1], "", 0

    palabras = texto.split(" ")

    for tam in tamanos:
        pdf.set_font(familia, estilo, tam)
        lineas: list[str] = []
        linea_act = ""
        cabe_todo = True

        for p in palabras:
            prueba = f"{linea_act} {p}".strip()
            if pdf.get_string_width(_limpiar(prueba)) <= ancho_max:
                linea_act = prueba
            else:
                if linea_act:
                    lineas.append(linea_act)
                    linea_act = p
                    if len(lineas) >= max_lineas:
                        cabe_todo = False
                        break
                else:
                    cabe_todo = False
                    break
        if cabe_todo and linea_act:
            lineas.append(linea_act)

        if cabe_todo and len(lineas) <= max_lineas:
            return tam, "\n".join(lineas), len(lineas)

    # Si no cupo completo con el menor tamaño de fuente:
    tam_min = tamanos[-1]
    pdf.set_font(familia, estilo, tam_min)
    lineas = []
    linea_act = ""
    idx = 0

    while idx < len(palabras) and len(lineas) < max_lineas - 1:
        p = palabras[idx]
        prueba = f"{linea_act} {p}".strip()
        if pdf.get_string_width(_limpiar(prueba)) <= ancho_max:
            linea_act = prueba
            idx += 1
        else:
            if linea_act:
                lineas.append(linea_act)
                linea_act = ""
            else:
                rec = p
                while rec and pdf.get_string_width(_limpiar(rec + "...")) > ancho_max:
                    rec = rec[:-1]
                lineas.append((rec + "...") if rec else "...")
                idx += 1

    if linea_act and len(lineas) < max_lineas - 1:
        lineas.append(linea_act)

    # Última línea disponible: recortar con '...' si excede el ancho permitido
    restante = " ".join(palabras[idx:])
    if pdf.get_string_width(_limpiar(restante)) <= ancho_max:
        lineas.append(restante)
    else:
        rec = restante
        while rec and pdf.get_string_width(_limpiar(rec + "...")) > ancho_max:
            rec = rec[:-1].rstrip()
        lineas.append((rec + "...") if rec else "...")

    return tam_min, "\n".join(lineas), len(lineas)


def _separar_recomendaciones(consejo: str) -> list[str]:
    """Separa el texto de recomendaciones en items limpios.

    - Detecta patrones numerados como 'N.' o 'N)' al inicio de cada item y une el número con su frase
      o retira la numeración para dar estructura homogénea de viñetas.
    - Si no hay numeración, separa por saltos de línea o por oraciones terminadas en punto.
    - Nunca genera items vacíos ni que solo contengan un número o puntuación suelta.
    """
    if not consejo or not consejo.strip():
        return []

    t = consejo.strip()

    # Detectar numeración tipo '1.' o '1)' al inicio de items
    patron_numeros = re.compile(r'(?:^|\s+)(\d{1,2})[\.\)]\s+')
    coincidencias = list(patron_numeros.finditer(t))

    if coincidencias and len(coincidencias) >= 1:
        partes = patron_numeros.split(t)
        items_candidatos = []
        intro = partes[0].strip()
        if intro and re.search(r'[a-zA-ZáéíóúñÁÉÍÓÚÑ]', intro):
            items_candidatos.append(intro.rstrip(":").strip())

        for i in range(1, len(partes), 2):
            contenido = partes[i + 1].strip() if i + 1 < len(partes) else ""
            if contenido and re.search(r'[a-zA-ZáéíóúñÁÉÍÓÚÑ]', contenido):
                items_candidatos.append(contenido)
    else:
        lineas = [lin.strip() for lin in t.splitlines() if lin.strip()]
        if len(lineas) > 1:
            items_candidatos = lineas
        else:
            items_candidatos = [s.strip() for s in re.split(r'\.\s+(?=[A-ZÁÉÍÓÚÑa-záéíóúñ])', t) if s.strip()]
            if not items_candidatos:
                items_candidatos = [t]

    items_limpios = []
    for item in items_candidatos:
        limpio = re.sub(r'^(?:[\-\*•–—]|\d{1,2}[\.\)])\s*', '', item).strip()
        limpio = limpio.rstrip(".;,").strip()
        if not limpio:
            continue
        if re.fullmatch(r'[\d\.\)\s\:\-]+', limpio):
            continue
        if not re.search(r'[a-zA-ZáéíóúñÁÉÍÓÚÑ]', limpio):
            continue
        items_limpios.append(limpio)

    return items_limpios or [t.rstrip(".").strip()]


def generar(d: Diagnostico, foto: Image.Image, mapa_calor: Image.Image | bytes | str | None = None) -> bytes:
    """Genera el PDF del diagnóstico en exactamente 1 hoja A4 con diseño profesional."""
    nombre_def, agente_def, consejo_def, urgencia_def = CLASES.get(d.clase or "", DESCONOCIDA)
    nombre = nombre_def or (d.clase or "").split("_", 1)[-1].replace("_", " ").capitalize()
    agente = agente_def or ""
    consejo = consejo_def or "Consulte con un técnico agrario para el plan de manejo."
    urgencia = urgencia_def or "media"
    es_sana = "sana" in (d.clase or "").lower()

    urg_texto, urg_color, urg_fondo = URGENCIA.get(urgencia, URGENCIA["media"])
    creado = d.creado if (d.creado and d.creado.tzinfo) else (d.creado.replace(tzinfo=timezone.utc) if d.creado else datetime.now(timezone.utc))
    fecha_completa = creado.astimezone(PERU).strftime("%d/%m/%Y %H:%M (hora de Perú)")
    fecha_corta = creado.astimezone(PERU).strftime("%d/%m/%Y")
    nombre_cultivo = CULTIVOS.get(d.cultivo or "", d.cultivo or "Cultivo").capitalize()
    canal_origen = {"web": "Plataforma Web", "bot": "Bot Telegram", "app": "App Móvil"}.get(d.origen, d.origen or "Digital")

    pdf = FPDF(format="A4", unit="mm")
    pdf.set_auto_page_break(False)  # Estrictamente prohibido pasar a 2 páginas
    pdf.set_title(_limpiar(f"FitoLens - Diagnóstico N° {d.id}"))
    pdf.set_author("FitoLens - Inteligencia Artificial para el Campo")
    pdf.add_page()

    # 1. ENCABEZADO CON MARCA FITOLENS
    # 1.1 Franja de acento superior
    pdf.set_fill_color(*ACENTO)
    pdf.rect(0, 0, 210, 4, "F")

    # 1.2 Bloque principal de cabecera
    pdf.set_fill_color(*NAVY_CABECERA)
    pdf.rect(0, 4, 210, 26, "F")

    # Nombre y subtítulo (izquierda)
    pdf.set_xy(14, 8)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(100, 8, "FitoLens", ln=0)

    pdf.set_xy(14, 18)
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(100, 5, _limpiar("Diagnóstico fitosanitario con inteligencia artificial"), ln=0)

    # N° de reporte y fecha/hora (derecha)
    pdf.set_xy(115, 8.5)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*ACENTO_CLARO)
    pdf.cell(81, 6, _limpiar(f"REPORTE N° {d.id:06d}"), align="R")

    pdf.set_xy(115, 17)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(203, 213, 225)
    pdf.cell(81, 5, _limpiar(fecha_completa), align="R")

    # 2. FOTO ANALIZADA Y MAPA DE CALOR LADO A LADO CON TAMAÑO FIJO
    y_fotos = 34
    ancho_foto_mm = 88
    alto_foto_mm = 50
    x_foto1 = 14
    x_foto2 = 108

    # Etiquetas sobre las fotos
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(*TEXTO_GRIS)
    pdf.set_xy(x_foto1, y_fotos)
    pdf.cell(ancho_foto_mm, 4, _limpiar("FOTO ANALIZADA DE CAMPO"), align="L")

    pdf.set_text_color(*ACENTO)
    pdf.set_xy(x_foto2, y_fotos)
    pdf.cell(ancho_foto_mm, 4, _limpiar("MAPA DE ATENCIÓN DE LA IA (GRAD-CAM)"), align="L")

    # Dibujar imágenes con dimensiones fijas exactas
    y_img = y_fotos + 4.5
    img_foto_buf = _preparar_foto_fija(foto, ancho_mm=ancho_foto_mm, alto_mm=alto_foto_mm)
    mapa_img = _obtener_mapa_calor(foto, d, mapa_calor)

    pdf.image(img_foto_buf, x=x_foto1, y=y_img, w=ancho_foto_mm, h=alto_foto_mm)
    if mapa_img is not None:
        img_mapa_buf = _preparar_foto_fija(mapa_img, ancho_mm=ancho_foto_mm, alto_mm=alto_foto_mm)
        pdf.image(img_mapa_buf, x=x_foto2, y=y_img, w=ancho_foto_mm, h=alto_foto_mm)
        # Pie sutil del mapa de calor: únicamente si hay mapa real
        pdf.set_xy(x_foto2, y_img + alto_foto_mm + 0.8)
        pdf.set_font("Helvetica", "I", 6.8)
        pdf.set_text_color(*TEXTO_GRIS)
        pdf.cell(ancho_foto_mm, 3.5, _limpiar("Zonas en rojo/amarillo determinaron el veredicto del modelo"), align="R")
    else:
        # Sin mapa real no se dibuja uno inventado: solo un aviso.
        pdf.set_xy(x_foto2, y_img + alto_foto_mm / 2 - 3)
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(*TEXTO_GRIS)
        pdf.cell(ancho_foto_mm, 6, _limpiar("Mapa de atención no disponible"), align="C")

    # Marco sutil para las fotos
    pdf.set_draw_color(*BORDE_SUAVE)
    pdf.set_line_width(0.3)
    pdf.rect(x_foto1, y_img, ancho_foto_mm, alto_foto_mm, "D")
    pdf.rect(x_foto2, y_img, ancho_foto_mm, alto_foto_mm, "D")

    # 3. TARJETA DESTACADA CON EL RESULTADO
    y_card = 93
    ancho_card = 182
    x_c1 = 20
    w_c1 = 98
    x_c2 = 124
    w_c2 = 68

    # Medición y ajuste previo de textos para que no se monten en la columna de urgencia
    # 3.1 Cultivo
    txt_cultivo = f"CULTIVO: {nombre_cultivo.upper()}"

    # 3.2 Nombre del diagnóstico (hasta 2 líneas, reduciendo fuente o recortando)
    tam_nombre, txt_nombre, n_lin_nom = _ajustar_texto_multicell(
        pdf, nombre, ancho_max=w_c1, tamanos=[14.0, 12.0, 10.5, 9.0, 8.0], estilo="B", max_lineas=2
    )
    inter_nom = 4.8 if tam_nombre >= 12.0 else 4.0
    h_nom = n_lin_nom * inter_nom

    # 3.3 Agente causal (hasta 2 líneas si existe)
    if agente:
        tam_agente, txt_agente, n_lin_agente = _ajustar_texto_multicell(
            pdf, agente, ancho_max=w_c1, tamanos=[8.5, 7.5, 7.0], estilo="I", max_lineas=2
        )
        inter_agente = 3.4
        h_agente = n_lin_agente * inter_agente
    else:
        tam_agente, txt_agente, n_lin_agente = 8.0, "", 0
        inter_agente = 0.0
        h_agente = 0.0

    # 3.4 Ubicación (hasta 2 líneas si es larga)
    ubi_txt = _ubicacion(d)
    txt_ubi_raw = f"Ubicación: {ubi_txt}"
    tam_ubi, txt_ubi, n_lin_ubi = _ajustar_texto_multicell(
        pdf, txt_ubi_raw, ancho_max=w_c1, tamanos=[8.0, 7.5, 7.0], estilo="", max_lineas=2
    )
    inter_ubi = 3.3
    h_ubi = n_lin_ubi * inter_ubi

    # 3.5 Canal y fecha
    h_canal = 3.2

    # Cálculo dinámico de la altura de la tarjeta según el contenido real
    alto_izq = (
        3.2 + 4.0 + (h_nom + 1.2) + ((h_agente + 1.2) if h_agente else 0.0) + (h_ubi + 1.2) + h_canal + 3.2
    )
    # Altura requerida por la columna derecha (urgencia + confianza + barra calibrada)
    alto_der = 3.0 + 14.0 + 2.0 + 3.8 + 1.0 + 3.8 + 1.0 + 3.2 + 3.2  # = 35.0 mm

    alto_card = max(alto_der, alto_izq)

    # Dibujar tarjeta contenedora con alto ajustado sin espacio vacío sobrante
    pdf.set_fill_color(*FONDO_TARJETA)
    pdf.set_draw_color(*BORDE_SUAVE)
    pdf.set_line_width(0.4)
    pdf.rect(14, y_card, ancho_card, alto_card, "DF")

    # Franja vertical de acento en el borde izquierdo de la tarjeta
    pdf.set_fill_color(*(COLOR_SANA if es_sana else urg_color))
    pdf.rect(14, y_card, 2.5, alto_card, "F")

    # Renderizado columna izquierda dentro de su margen estricto w_c1
    y_cur = y_card + 3.2
    pdf.set_xy(x_c1, y_cur)
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(*ACENTO)
    pdf.cell(w_c1, 3.2, _limpiar(txt_cultivo))
    y_cur += 4.2

    pdf.set_xy(x_c1, y_cur)
    pdf.set_font("Helvetica", "B", tam_nombre)
    pdf.set_text_color(*(COLOR_SANA if es_sana else urg_color))
    pdf.multi_cell(w_c1, inter_nom, _limpiar(txt_nombre))
    y_cur = pdf.get_y() + 1.2

    if agente and txt_agente:
        pdf.set_xy(x_c1, y_cur)
        pdf.set_font("Helvetica", "I", tam_agente)
        pdf.set_text_color(*TEXTO_GRIS)
        pdf.multi_cell(w_c1, inter_agente, _limpiar(txt_agente))
        y_cur = pdf.get_y() + 1.2

    pdf.set_xy(x_c1, y_cur)
    pdf.set_font("Helvetica", "", tam_ubi)
    pdf.set_text_color(*TEXTO_OSCURO)
    pdf.multi_cell(w_c1, inter_ubi, _limpiar(txt_ubi))
    y_cur = pdf.get_y() + 1.2

    pdf.set_xy(x_c1, y_cur)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*TEXTO_GRIS)
    pdf.cell(w_c1, h_canal, _limpiar(f"Canal: {canal_origen}  ·  Fecha: {fecha_corta}"))

    # Columna derecha de la tarjeta: Nivel de Urgencia y Barra de Confianza
    y_urg = y_card + 3.0
    h_urg = 14.0
    pdf.set_fill_color(*urg_fondo)
    pdf.set_draw_color(*urg_color)
    pdf.set_line_width(0.4)
    pdf.rect(x_c2, y_urg, w_c2, h_urg, "DF")

    pdf.set_xy(x_c2, y_urg + 1.5)
    pdf.set_font("Helvetica", "B", 6.5)
    pdf.set_text_color(*urg_color)
    pdf.cell(w_c2, 3.2, "NIVEL DE URGENCIA", align="C")

    pdf.set_xy(x_c2, y_urg + 5.2)
    pdf.set_font("Helvetica", "B", 10.0)
    pdf.set_text_color(*urg_color)
    pdf.cell(w_c2, 7.2, _limpiar(urg_texto), align="C")

    # Confianza y barra de progreso
    conf_pct = round((d.confianza or 0) * 100)
    y_conf = y_urg + h_urg + 2.0
    pdf.set_xy(x_c2, y_conf)
    pdf.set_font("Helvetica", "B", 8.0)
    pdf.set_text_color(*TEXTO_OSCURO)
    pdf.cell(w_c2, 3.8, _limpiar(f"Confianza de la IA: {conf_pct} %"), align="L")

    y_barra = y_conf + 4.6
    h_barra = 3.8
    pdf.set_fill_color(226, 232, 240)
    pdf.rect(x_c2, y_barra, w_c2, h_barra, "F")
    conf_ratio = max(0.0, min(1.0, d.confianza or 0))
    if conf_ratio > 0:
        pdf.set_fill_color(*(COLOR_SANA if es_sana else urg_color))
        pdf.rect(x_c2, y_barra, w_c2 * conf_ratio, h_barra, "F")

    y_calib = y_barra + h_barra + 1.0
    pdf.set_xy(x_c2, y_calib)
    pdf.set_font("Helvetica", "", 6.8)
    pdf.set_text_color(*TEXTO_GRIS)
    pdf.cell(w_c2, 3.2, _limpiar("Calibrada contra falsos positivos"), align="L")

    # 4. RECOMENDACIONES DE TRATAMIENTO EN LISTA COMPACTA
    y_rec = y_card + alto_card + 4.0
    pdf.set_xy(14, y_rec)
    pdf.set_font("Helvetica", "B", 9.5)
    pdf.set_text_color(*ACENTO)
    pdf.cell(182, 4.5, _limpiar("RECOMENDACIONES DE MANEJO Y TRATAMIENTO"), align="L")

    pdf.set_draw_color(*ACENTO)
    pdf.set_line_width(0.5)
    pdf.line(14, y_rec + 5.0, 196, y_rec + 5.0)

    # Preparar viñetas limpias a partir del consejo
    frases_crudas = _separar_recomendaciones(consejo)

    # Control de tamaño y prevención estricta de desborde
    y_cursor = y_rec + 7.5
    max_y_permitido = 224

    longitud_total = sum(len(f) for f in frases_crudas)
    tam_fuente = 9.0 if longitud_total < 320 else (8.0 if longitud_total < 650 else 7.2)
    interlineado = 4.2 if tam_fuente >= 9.0 else (3.6 if tam_fuente >= 8.0 else 3.1)

    pdf.set_font("Helvetica", "", tam_fuente)
    pdf.set_text_color(*TEXTO_OSCURO)

    ancho_util = 178
    for frase in frases_crudas:
        texto_item = f"- {frase}."
        ancho_texto = pdf.get_string_width(_limpiar(texto_item))
        lineas_estimadas = max(1, math.ceil(ancho_texto / ancho_util))
        alto_estimado = lineas_estimadas * interlineado + 1.2

        if y_cursor + alto_estimado > max_y_permitido:
            pdf.set_xy(16, y_cursor)
            pdf.set_font("Helvetica", "I", tam_fuente)
            pdf.set_text_color(*TEXTO_GRIS)
            pdf.cell(ancho_util, interlineado, _limpiar("... [Recomendaciones adicionales resumidas por espacio; consulte con su agrónomo]."))
            y_cursor += interlineado + 1.0
            break

        pdf.set_xy(16, y_cursor)
        pdf.multi_cell(ancho_util, interlineado, _limpiar(texto_item))
        y_cursor = pdf.get_y() + 1.0

    # Nota obligatoria de seguridad agrícola y dosis SENASA
    y_aviso = 227
    pdf.set_fill_color(241, 245, 249)
    pdf.set_draw_color(*BORDE_SUAVE)
    pdf.set_line_width(0.3)
    pdf.rect(14, y_aviso, 182, 14, "DF")

    pdf.set_xy(16, y_aviso + 1.5)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(180, 83, 9)
    pdf.cell(178, 3.2, _limpiar("NORMATIVA DE SEGURIDAD Y APLICACIÓN:"))

    pdf.set_xy(16, y_aviso + 4.8)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*TEXTO_OSCURO)
    pdf.multi_cell(178, 3.4, _limpiar(
        "Dosis y formulación: Siga siempre la etiqueta del producto registrado ante SENASA. Utilice equipo "
        "de protección personal (EPP) completo y respete estrictamente el periodo de carencia previo a la cosecha."
    ))

    # 5. ESPACIO DE CONFORMIDAD Y FIRMAS
    y_firmas = 247
    pdf.set_draw_color(*TEXTO_GRIS)
    pdf.set_line_width(0.2)
    pdf.line(20, y_firmas + 8, 85, y_firmas + 8)
    pdf.line(125, y_firmas + 8, 190, y_firmas + 8)

    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*TEXTO_GRIS)
    pdf.set_xy(20, y_firmas + 9)
    pdf.cell(65, 4, _limpiar("Firma del productor / agricultor"), align="C")
    pdf.set_xy(125, y_firmas + 9)
    pdf.cell(65, 4, _limpiar("Técnico o agencia agraria"), align="C")

    # 6. PIE DE PÁGINA
    pdf.set_draw_color(*BORDE_SUAVE)
    pdf.set_line_width(0.3)
    pdf.line(14, 267, 196, 267)

    # Aviso obligatorio
    pdf.set_xy(14, 268.5)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*TEXTO_OSCURO)
    pdf.cell(182, 4, _limpiar("Diagnóstico orientativo, confirme con un técnico agrario."), align="C")

    # URL del sitio y marca
    url_actual = _obtener_url_sitio()
    pdf.set_xy(14, 273)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*TEXTO_GRIS)
    pdf.cell(182, 3.8, _limpiar(f"FitoLens · Vigilancia Fitosanitaria con IA  |  Sitio web: {url_actual}"), align="C")

    # Metadatos del diagnóstico (fecha, modelo, SHA-256)
    sha_recortado = (d.imagen_sha256 or "")[:16]
    pdf.set_xy(14, 277)
    pdf.set_font("Helvetica", "I", 6.8)
    pdf.set_text_color(*TEXTO_GRIS)
    pdf.cell(182, 3.5, _limpiar(f"Emisión: {fecha_completa}  |  Modelo: {d.modelo_version}  |  Huella SHA-256: {sha_recortado}..."), align="C")

    return bytes(pdf.output())
