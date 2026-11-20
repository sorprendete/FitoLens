"""Exporta el reporte semanal a Excel (.xlsx) para entregarlo a la agencia agraria o al gobierno regional."""
import io
from datetime import date, datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

CABECERA = PatternFill("solid", fgColor="1F2A44")
BLANCO = Font(bold=True, color="FFFFFF")
TENDENCIA = {"sube": "Sube", "baja": "Baja", "estable": "Estable", "nuevo": "Nuevo"}


def _fecha(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%d/%m/%Y")


def _tabla(hoja, fila: int, columnas: list[str], datos: list[list], anchos: list[int] | None = None) -> None:
    for j, titulo in enumerate(columnas, 1):
        c = hoja.cell(fila, j, titulo)
        c.fill, c.font, c.alignment = CABECERA, BLANCO, Alignment(horizontal="center", vertical="center", wrap_text=True)
    for i, valores in enumerate(datos, fila + 1):
        for j, v in enumerate(valores, 1):
            hoja.cell(i, j, v)
    for j, ancho in enumerate(anchos or [], 1):
        hoja.column_dimensions[get_column_letter(j)].width = ancho
    hoja.freeze_panes = hoja.cell(fila + 1, 1)
    if datos:
        hoja.auto_filter.ref = f"A{fila}:{get_column_letter(len(columnas))}{fila + len(datos)}"


def exportar(r: dict) -> bytes:
    libro = Workbook()
    h = libro.active
    h.title = "Resumen"
    h["A1"] = "FitoLens · Reporte fitosanitario semanal · Región San Martín"
    h["A1"].font = Font(bold=True, size=14)
    h["A2"] = f"Periodo: {_fecha(r['desde'])} al {_fecha(r['hasta'])} · Generado: {datetime.now():%d/%m/%Y %H:%M}"
    t = r["totales"]
    h["A3"] = (f"Diagnósticos: {t['analisis']} · Con enfermedad: {t['enfermos']} · Sanos: {t['sanos']} · "
               f"Provincias con casos: {t['provincias_con_casos']} · Alertas de brote: {t['alertas']}")
    h["A4"] = "Orientación generada por IA; confirmar con un técnico agrario o SENASA."
    h["A4"].font = Font(italic=True, color="666666")
    semanas = [f"Sem. {_fecha(s['inicio'])[:5]}" for s in r["semanas"]]
    columnas = ["Provincia", "Cultivo", "Diagnósticos", "Sanos", "Con enfermedad", "% con enfermedad",
                "Enfermedad principal", "Casos principal", *semanas, "Tendencia", "Variación %"]
    datos = [[f["provincia_nombre"], f["cultivo_nombre"], f["analisis"], f["sanos"], f["enfermos"], f["pct_enfermos"],
              f["principal"]["etiqueta"] if f["principal"] else "—", f["principal"]["casos"] if f["principal"] else 0,
              *f["enfermos_por_semana"], TENDENCIA[f["tendencia"]], f["tendencia_pct"]] for f in r["filas"]]
    _tabla(h, 6, columnas, datos, [18, 12, 13, 9, 14, 14, 26, 13, *[11] * len(semanas), 11, 11])
    for fila in h.iter_rows(min_row=7, min_col=6, max_col=6):
        fila[0].number_format = "0.0%"
    h.freeze_panes = "C7"

    e = libro.create_sheet("Enfermedades")
    _tabla(e, 1, ["Provincia", "Cultivo", "Enfermedad", "Casos"],
           [[f["provincia_nombre"], f["cultivo_nombre"], x["etiqueta"], x["casos"]]
            for f in r["filas"] for x in f["enfermedades"]], [18, 12, 30, 9])

    s = libro.create_sheet("Por semana")
    _tabla(s, 1, ["Semana (desde el lunes)", "Diagnósticos", "Con enfermedad", "Sanos"],
           [[_fecha(x["inicio"]), x["analisis"], x["enfermos"], x["analisis"] - x["enfermos"]] for x in r["semanas"]],
           [24, 13, 15, 9])

    a = libro.create_sheet("Alertas de brote")
    _tabla(a, 1, ["Fecha", "Provincia", "Cultivo", "Enfermedad", "Casos"],
           [[datetime.fromisoformat(x["creado"]).strftime("%d/%m/%Y %H:%M"), x["provincia_nombre"],
             x["cultivo_nombre"], x["etiqueta"], x["casos"]] for x in r["alertas"]],
           [17, 18, 12, 30, 9])

    buf = io.BytesIO()
    libro.save(buf)
    return buf.getvalue()
