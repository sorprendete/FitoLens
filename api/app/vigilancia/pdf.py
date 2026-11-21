"""Exporta el reporte semanal de vigilancia fitosanitaria a PDF para autoridades agrarias.

Aplica la misma identidad visual de FitoLens:
- Franja de acento superior y encabezado con marca FitoLens.
- Resumen ejecutivo con tarjetas KPI.
- Tablas limpias con filas alternadas para fácil lectura.
- Pie de página automático con formato 'Página X de Y' y aviso oficial.
"""
from datetime import date, datetime, timedelta, timezone

from fpdf import FPDF

PERU = timezone(timedelta(hours=-5))

# Paleta oficial FitoLens
ACENTO = (8, 145, 178)          # Cyan web (#0891b2)
ACENTO_CLARO = (56, 189, 248)    # Cyan brillante (#38bdf8)
NAVY_CABECERA = (11, 19, 41)     # Navy oscuro (#0b1329)
NAVY_TABLA = (15, 23, 42)        # Slate 900 (#0f172a)
TEXTO_OSCURO = (30, 41, 59)      # Slate 800 (#1e293b)
TEXTO_GRIS = (100, 116, 139)     # Slate 500 (#64748b)
FILA_PAR = (248, 250, 252)       # Slate 50 (#f8fafc)
FILA_IMPAR = (255, 255, 255)     # Blanco (#ffffff)
BORDE_TABLA = (226, 232, 240)    # Slate 200 (#e2e8f0)
ROJO_ALERTA = (220, 38, 38)      # Rojo (#dc2626)
VERDE_OK = (5, 150, 105)         # Verde (#059669)

TENDENCIA_TEXTO = {"sube": "Sube", "baja": "Baja", "estable": "Estable", "nuevo": "Nuevo"}
URL_SITIO = "https://fitolens.pe"


def _limpiar(t: str | None) -> str:
    """Convierte caracteres especiales a su versión Latin-1 compatible con FPDF."""
    if not t:
        return ""
    reemplazos = {
        "–": "-", "—": "-", "•": "-", "“": '"', "”": '"',
        "‘": "'", "’": "'", "…": "...", "°": "o", "²": "2",
        "³": "3", "±": "+/-", "×": "x", "\u200b": "", "\xa0": " ",
        "▲": "+", "▼": "-", "●": "*", "=": "=",
    }
    for orig, rep in reemplazos.items():
        t = t.replace(orig, rep)
    return t.encode("latin-1", "replace").decode("latin-1")


def _fecha(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        return date.fromisoformat(iso[:10]).strftime("%d/%m/%Y")
    except Exception:
        return str(iso)


class PDFReporteSemanal(FPDF):
    def __init__(self, periodo_txt: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.periodo_txt = periodo_txt
        self.set_auto_page_break(auto=True, margin=20)
        self.alias_nb_pages()

    def header(self):
        # 1. Franja de acento superior
        self.set_fill_color(*ACENTO)
        self.rect(0, 0, 210, 4, "F")

        # 2. Bloque de encabezado
        self.set_fill_color(*NAVY_CABECERA)
        self.rect(0, 4, 210, 24, "F")

        # Logo y título
        self.set_xy(14, 8)
        self.set_font("Helvetica", "B", 18)
        self.set_text_color(255, 255, 255)
        self.cell(110, 7, "FitoLens", ln=0)

        self.set_xy(14, 16.5)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(148, 163, 184)
        self.cell(110, 5, _limpiar("Vigilancia Fitosanitaria Semanal · Región San Martín"), ln=0)

        # Periodo y emisión (derecha)
        self.set_xy(125, 8.5)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*ACENTO_CLARO)
        self.cell(71, 5.5, _limpiar(f"Periodo: {self.periodo_txt}"), align="R")

        self.set_xy(125, 16)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(203, 213, 225)
        ahora_peru = datetime.now(PERU).strftime("%d/%m/%Y %H:%M")
        self.cell(71, 5, _limpiar(f"Emisión: {ahora_peru}"), align="R")

        self.set_y(32)

    def footer(self):
        self.set_y(-16)
        self.set_draw_color(*BORDE_TABLA)
        self.set_line_width(0.3)
        self.line(14, self.get_y(), 196, self.get_y())
        self.ln(2)

        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*TEXTO_GRIS)
        self.cell(120, 5, _limpiar(f"Diagnóstico orientativo con IA · Confirmar con SENASA | {URL_SITIO}"))
        self.cell(62, 5, _limpiar(f"Página {self.page_no()} de {{nb}}"), align="R")


def _kpi(pdf: PDFReporteSemanal, x: float, y: float, w: float, h: float, titulo: str, valor: str, sub: str, color_acento=ACENTO):
    """Dibuja una tarjeta KPI estilizada."""
    pdf.set_fill_color(*FILA_PAR)
    pdf.set_draw_color(*BORDE_TABLA)
    pdf.set_line_width(0.3)
    pdf.rect(x, y, w, h, "DF")

    # Acento superior
    pdf.set_fill_color(*color_acento)
    pdf.rect(x, y, w, 1.8, "F")

    pdf.set_xy(x + 2, y + 3)
    pdf.set_font("Helvetica", "B", 6.8)
    pdf.set_text_color(*TEXTO_GRIS)
    pdf.cell(w - 4, 3.5, _limpiar(titulo.upper()), align="L")

    pdf.set_xy(x + 2, y + 7.5)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*TEXTO_OSCURO)
    pdf.cell(w - 4, 6, _limpiar(valor), align="L")

    pdf.set_xy(x + 2, y + 14)
    pdf.set_font("Helvetica", "", 6.5)
    pdf.set_text_color(*TEXTO_GRIS)
    pdf.cell(w - 4, 3, _limpiar(sub), align="L")


def exportar(r: dict) -> bytes:
    """Genera el reporte semanal para autoridades en PDF con tablas alternadas y pie 'Página X de Y'."""
    periodo_txt = f"{_fecha(r['desde'])} al {_fecha(r['hasta'])}"
    pdf = PDFReporteSemanal(periodo_txt)
    pdf.set_title(_limpiar(f"FitoLens - Reporte Semanal {r['hasta']}"))
    pdf.set_author("FitoLens")
    pdf.add_page()

    # 1. RESUMEN EJECUTIVO (KPIs)
    t = r.get("totales", {})
    tot_analisis = t.get("analisis", 0)
    tot_enfermos = t.get("enfermos", 0)
    tot_sanos = t.get("sanos", 0)
    tot_prov = t.get("provincias_con_casos", 0)
    tot_alertas = t.get("alertas", 0)

    pct_enfermos = round((tot_enfermos / tot_analisis * 100), 1) if tot_analisis else 0.0

    y_kpi = pdf.get_y() + 1
    w_kpi = 34.4
    espacio = 2.5

    _kpi(pdf, 14 + 0 * (w_kpi + espacio), y_kpi, w_kpi, 18, "Diagnósticos", str(tot_analisis), "Total analizados", ACENTO)
    _kpi(pdf, 14 + 1 * (w_kpi + espacio), y_kpi, w_kpi, 18, "Con Enfermedad", str(tot_enfermos), f"{pct_enfermos}% del total", ROJO_ALERTA if tot_enfermos else ACENTO)
    _kpi(pdf, 14 + 2 * (w_kpi + espacio), y_kpi, w_kpi, 18, "Plantas Sanas", str(tot_sanos), f"{round(100 - pct_enfermos, 1)}% sanas", VERDE_OK)
    _kpi(pdf, 14 + 3 * (w_kpi + espacio), y_kpi, w_kpi, 18, "Provincias", str(tot_prov), "Con incidencia activa", ACENTO)
    _kpi(pdf, 14 + 4 * (w_kpi + espacio), y_kpi, w_kpi, 18, "Alertas Brote", str(tot_alertas), "Requieren atención", ROJO_ALERTA if tot_alertas else ACENTO)

    # 2. TABLA DE RESUMEN POR PROVINCIA Y CULTIVO
    pdf.set_y(y_kpi + 22)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*ACENTO)
    pdf.cell(182, 5, _limpiar("1. RESUMEN EPIDEMIOLÓGICO POR PROVINCIA Y CULTIVO"), ln=1)

    columnas = [
        ("Provincia", 32, "L"),
        ("Cultivo", 22, "L"),
        ("Casos", 16, "C"),
        ("Sanos", 14, "C"),
        ("Enfermos", 18, "C"),
        ("% Enf.", 16, "C"),
        ("Enfermedad Principal", 44, "L"),
        ("Tendencia", 20, "C"),
    ]

    # Cabecera de la tabla
    pdf.set_fill_color(*NAVY_TABLA)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 7.5)
    for titulo, ancho, alineacion in columnas:
        pdf.cell(ancho, 6.5, _limpiar(titulo), border=1, align=alineacion, fill=True)
    pdf.ln()

    # Filas alternadas
    filas = r.get("filas", [])
    if not filas:
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(*TEXTO_GRIS)
        pdf.cell(182, 8, _limpiar("Sin diagnósticos registrados en este periodo."), border=1, align="C")
        pdf.ln()
    else:
        pdf.set_font("Helvetica", "", 7.5)
        for idx, f in enumerate(filas):
            # Salto de página preventivo para filas
            if pdf.get_y() > 265:
                pdf.add_page()
                # Re-imprimir cabecera de tabla
                pdf.set_fill_color(*NAVY_TABLA)
                pdf.set_text_color(255, 255, 255)
                pdf.set_font("Helvetica", "B", 7.5)
                for titulo, ancho, alineacion in columnas:
                    pdf.cell(ancho, 6.5, _limpiar(titulo), border=1, align=alineacion, fill=True)
                pdf.ln()
                pdf.set_font("Helvetica", "", 7.5)

            fill_color = FILA_IMPAR if idx % 2 == 0 else FILA_PAR
            pdf.set_fill_color(*fill_color)
            pdf.set_text_color(*TEXTO_OSCURO)
            pdf.set_draw_color(*BORDE_TABLA)

            pct_txt = f"{round(f.get('pct_enfermos', 0) * 100)}%"
            tend_nombre = TENDENCIA_TEXTO.get(f.get("tendencia"), f.get("tendencia") or "Estable")
            if f.get("tendencia_pct"):
                tend_nombre += f" ({'+' if f['tendencia_pct'] > 0 else ''}{f['tendencia_pct']}%)"

            principal = f.get("principal")
            princ_txt = f"{principal['etiqueta']} ({principal['casos']})" if principal else "—"

            pdf.cell(32, 5.5, _limpiar(f.get("provincia_nombre", "—")[:22]), border=1, align="L", fill=True)
            pdf.cell(22, 5.5, _limpiar(f.get("cultivo_nombre", "—")[:15]), border=1, align="L", fill=True)
            pdf.cell(16, 5.5, str(f.get("analisis", 0)), border=1, align="C", fill=True)
            pdf.cell(14, 5.5, str(f.get("sanos", 0)), border=1, align="C", fill=True)
            pdf.cell(18, 5.5, str(f.get("enfermos", 0)), border=1, align="C", fill=True)
            pdf.cell(16, 5.5, _limpiar(pct_txt), border=1, align="C", fill=True)
            pdf.cell(44, 5.5, _limpiar(princ_txt[:30]), border=1, align="L", fill=True)
            pdf.cell(20, 5.5, _limpiar(tend_nombre[:16]), border=1, align="C", fill=True)
            pdf.ln()

    # 3. TABLA DE ALERTAS DE BROTE (si existen)
    alertas = r.get("alertas", [])
    if alertas:
        pdf.ln(4)
        if pdf.get_y() > 240:
            pdf.add_page()

        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*ROJO_ALERTA)
        pdf.cell(182, 5, _limpiar(f"2. ALERTAS FITOSANITARIAS DE BROTE ({len(alertas)} ACTIVAS)"), ln=1)

        cols_alertas = [
            ("Fecha y Hora", 36, "L"),
            ("Provincia", 36, "L"),
            ("Cultivo", 26, "L"),
            ("Enfermedad / Foco detectado", 64, "L"),
            ("Casos", 20, "C"),
        ]

        pdf.set_fill_color(185, 28, 28)  # Rojo oscuro (#b91c1c)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 7.5)
        for tit, anc, ali in cols_alertas:
            pdf.cell(anc, 6, _limpiar(tit), border=1, align=ali, fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 7.5)
        for idx, a in enumerate(alertas):
            if pdf.get_y() > 265:
                pdf.add_page()
                pdf.set_fill_color(185, 28, 28)
                pdf.set_text_color(255, 255, 255)
                pdf.set_font("Helvetica", "B", 7.5)
                for tit, anc, ali in cols_alertas:
                    pdf.cell(anc, 6, _limpiar(tit), border=1, align=ali, fill=True)
                pdf.ln()
                pdf.set_font("Helvetica", "", 7.5)

            fill_color = FILA_IMPAR if idx % 2 == 0 else (254, 242, 242)
            pdf.set_fill_color(*fill_color)
            pdf.set_text_color(*TEXTO_OSCURO)
            pdf.set_draw_color(*BORDE_TABLA)

            fecha_a = _fecha(a.get("creado"))
            pdf.cell(36, 5.5, _limpiar(fecha_a), border=1, align="L", fill=True)
            pdf.cell(36, 5.5, _limpiar(a.get("provincia_nombre", "—")[:24]), border=1, align="L", fill=True)
            pdf.cell(26, 5.5, _limpiar(a.get("cultivo_nombre", "—")[:18]), border=1, align="L", fill=True)
            pdf.cell(64, 5.5, _limpiar(a.get("etiqueta", "—")[:42]), border=1, align="L", fill=True)
            pdf.cell(20, 5.5, str(a.get("casos", 0)), border=1, align="C", fill=True)
            pdf.ln()

    # 4. TABLA DE ENFERMEDADES DETECTADAS (desglose)
    enfermedades_todas = []
    for f in filas:
        for e in f.get("enfermedades", []):
            enfermedades_todas.append({
                "provincia": f.get("provincia_nombre", "—"),
                "cultivo": f.get("cultivo_nombre", "—"),
                "etiqueta": e.get("etiqueta", "—"),
                "casos": e.get("casos", 0),
            })

    if enfermedades_todas:
        pdf.ln(4)
        if pdf.get_y() > 240:
            pdf.add_page()

        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*ACENTO)
        pdf.cell(182, 5, _limpiar("3. PRINCIPALES PATÓGENOS Y ENFERMEDADES IDENTIFICADAS"), ln=1)

        cols_enf = [
            ("Provincia", 40, "L"),
            ("Cultivo", 32, "L"),
            ("Enfermedad / Plaga", 86, "L"),
            ("Casos", 24, "C"),
        ]

        pdf.set_fill_color(*NAVY_TABLA)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 7.5)
        for tit, anc, ali in cols_enf:
            pdf.cell(anc, 6, _limpiar(tit), border=1, align=ali, fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 7.5)
        for idx, e in enumerate(enfermedades_todas[:25]):  # Top 25 para mantener orden
            if pdf.get_y() > 265:
                pdf.add_page()
                pdf.set_fill_color(*NAVY_TABLA)
                pdf.set_text_color(255, 255, 255)
                pdf.set_font("Helvetica", "B", 7.5)
                for tit, anc, ali in cols_enf:
                    pdf.cell(anc, 6, _limpiar(tit), border=1, align=ali, fill=True)
                pdf.ln()
                pdf.set_font("Helvetica", "", 7.5)

            fill_color = FILA_IMPAR if idx % 2 == 0 else FILA_PAR
            pdf.set_fill_color(*fill_color)
            pdf.set_text_color(*TEXTO_OSCURO)
            pdf.set_draw_color(*BORDE_TABLA)

            pdf.cell(40, 5.5, _limpiar(e["provincia"][:26]), border=1, align="L", fill=True)
            pdf.cell(32, 5.5, _limpiar(e["cultivo"][:20]), border=1, align="L", fill=True)
            pdf.cell(86, 5.5, _limpiar(e["etiqueta"][:55]), border=1, align="L", fill=True)
            pdf.cell(24, 5.5, str(e["casos"]), border=1, align="C", fill=True)
            pdf.ln()

    return bytes(pdf.output())
