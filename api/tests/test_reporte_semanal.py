"""Reporte semanal para autoridades: agrupación, tendencia, permisos y Excel."""
import io
from datetime import date, datetime, time, timedelta, timezone

from openpyxl import load_workbook

from app.db import sesion as db_sesion
from app.db.modelos import Diagnostico
from app.vigilancia.reporte import lunes, tendencia
from tests.conftest import token

HOY = date(2026, 11, 19)  # jueves
LUNES = lunes(HOY)


def sembrar(filas):
    with db_sesion.fabrica()() as s:
        for dias, provincia, cultivo, clase, enferma, *estado in filas:
            s.add(Diagnostico(creado=datetime.combine(LUNES + timedelta(days=dias), time(12), timezone.utc),
                              estado=estado[0] if estado else "diagnostico", cultivo=cultivo, clase=clase,
                              enferma=enferma, provincia=provincia, modelo_version="t", imagen_sha256="0" * 64,
                              duracion_ms=1))
        s.commit()


DATOS = [
    # semana actual: lamas/cafe 3 roya + 1 sana; semana anterior: 1 roya
    (0, "lamas", "cafe", "cafe_roya", True), (1, "lamas", "cafe", "cafe_roya", True),
    (2, "lamas", "cafe", "cafe_roya", True), (2, "lamas", "cafe", "cafe_sana", False),
    (-5, "lamas", "cafe", "cafe_roya", True),
    (1, None, "cacao", "cacao_monilia", True),
    (1, "rioja", "cafe", None, False, "rechazada"),  # no cuenta
    (-60, "rioja", "cafe", "cafe_roya", True),  # fuera de rango
]


def test_tendencia():
    assert tendencia(0, 0) == ("estable", 0)
    assert tendencia(3, 0) == ("nuevo", None)
    assert tendencia(3, 1) == ("sube", 200)
    assert tendencia(1, 4) == ("baja", -75)
    assert tendencia(10, 10) == ("estable", 0)


def test_solo_admin(cliente):
    assert cliente.get("/api/reportes/semanal").status_code == 401
    cliente.post("/api/auth/registro", json={"nombre": "Ana", "email": "ana@x.pe", "password": "clave-segura-1"})
    t = token(cliente, "ana@x.pe", "clave-segura-1")
    assert cliente.get("/api/reportes/semanal", headers=t).status_code == 403
    assert cliente.get("/api/reportes/semanal.xlsx", headers=t).status_code == 403


def test_reporte_json(cliente):
    sembrar(DATOS)
    r = cliente.get(f"/api/reportes/semanal?semanas=4&hasta={HOY}", headers=token(cliente))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["desde"] == (LUNES - timedelta(weeks=3)).isoformat() and d["hasta"] == HOY.isoformat()
    assert [s["inicio"] for s in d["semanas"]][-1] == LUNES.isoformat()
    assert d["totales"] == {"analisis": 6, "enfermos": 5, "sanos": 1, "provincias_con_casos": 2, "alertas": 0}
    primera = d["filas"][0]
    assert (primera["provincia"], primera["cultivo"]) == ("lamas", "cafe")
    assert primera["provincia_nombre"] == "Lamas" and primera["cultivo_nombre"] == "Café"
    assert primera["enfermos_por_semana"] == [0, 0, 1, 3]
    assert (primera["tendencia"], primera["tendencia_pct"]) == ("sube", 200)
    assert primera["principal"]["clase"] == "cafe_roya" and primera["principal"]["casos"] == 4
    assert primera["pct_enfermos"] == 0.8
    sin = next(f for f in d["filas"] if f["cultivo"] == "cacao")
    assert sin["provincia_nombre"] == "Sin provincia" and sin["tendencia"] == "nuevo"


def test_reporte_vacio_y_limites(cliente):
    t = token(cliente)
    d = cliente.get("/api/reportes/semanal?semanas=1", headers=t).json()
    assert d["filas"] == [] and d["totales"]["analisis"] == 0 and len(d["semanas"]) == 1
    assert cliente.get("/api/reportes/semanal?semanas=0", headers=t).status_code == 422
    assert cliente.get("/api/reportes/semanal?semanas=27", headers=t).status_code == 422


def test_reporte_excel(cliente):
    sembrar(DATOS)
    r = cliente.get(f"/api/reportes/semanal.xlsx?semanas=4&hasta={HOY}", headers=token(cliente))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert f"fitolens_reporte_{HOY}.xlsx" in r.headers["content-disposition"]
    libro = load_workbook(io.BytesIO(r.content))
    assert libro.sheetnames == ["Resumen", "Enfermedades", "Por semana", "Alertas de brote"]
    h = libro["Resumen"]
    assert h["A6"].value == "Provincia" and h["A7"].value == "Lamas" and h["B7"].value == "Café"
    assert libro["Por semana"].max_row == 5
