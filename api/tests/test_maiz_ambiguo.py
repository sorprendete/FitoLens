"""Pruebas de las reglas de ambigüedad de maíz (probabilidades y huecos en máscara)."""
import numpy as np

from app.ia.pipeline import MOTIVO_MAIZ_AMBIGUO
from app.ia.registro import cargar
from app.ia.segmentacion import Segmentacion
import crear_modelos_falsos
from tests.conftest import foto


def test_tizon_claro_sigue_saliendo_tizon(cliente, tmp_path):
    """Tizón con confianza alta y cogollero lejos debe diagnosticarse como tizón."""
    crear_modelos_falsos.crear_todos(tmp_path, cultivo_router="maiz")
    # maiz con favorita="maiz_tizon_hoja" da > 98% a tizón y cogollero < 1%
    crear_modelos_falsos.crear(tmp_path, "maiz", favorita="maiz_tizon_hoja")
    cliente.app.state.registro = cargar(tmp_path, 1, segmentar=False)

    r = cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", foto(), "image/jpeg")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["estado"] == "diagnostico"
    assert d["cultivo"] == "maiz"
    assert d["clase"] == "maiz_tizon_hoja"
    assert d["confianza"] > 0.8


def test_tizon_con_cogollero_cercano_sale_no_concluyente(cliente, tmp_path):
    """Si tizón y cogollero tienen probabilidades cercanas (< 0.15) o la otra >= 0.15, sale no concluyente."""
    crear_modelos_falsos.crear_todos(tmp_path, cultivo_router="maiz")
    # maiz tiene clases:
    # 0: maiz_sana, 1: maiz_tizon_hoja, 2: maiz_roya_comun, 3: maiz_mancha_gris, 4: maiz_gusano_cogollero
    # Fijamos sesgo para que tizón y cogollero tengan probabilidades muy cercanas (ambos > 0.15)
    sesgo = np.zeros(5)
    sesgo[1] = 5.0  # tizón
    sesgo[4] = 4.8  # cogollero muy cercano (diferencia < 0.15, ambos >= 0.15)
    crear_modelos_falsos.crear(tmp_path, "maiz", sesgo=sesgo)
    cliente.app.state.registro = cargar(tmp_path, 1, segmentar=False)

    r = cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", foto(), "image/jpeg")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["estado"] == "no_concluyente"
    assert d["clase"] is None
    assert d["motivo"] == MOTIVO_MAIZ_AMBIGUO
    assert len(d["top3"]) >= 2


def test_tizon_con_huecos_en_mascara_sale_no_concluyente(cliente, tmp_path):
    """Si la clase ganadora es tizón con alta confianza pero la máscara tiene huecos (> 3%), sale no concluyente."""
    crear_modelos_falsos.crear_todos(tmp_path, cultivo_router="maiz")
    crear_modelos_falsos.crear(tmp_path, "maiz", favorita="maiz_tizon_hoja")
    cliente.app.state.registro = cargar(tmp_path, 1, segmentar=False)

    class SegmentadorConHuecos:
        def segmentar(self, imagen):
            # Hoja de 100x100 (área 10000) con hueco interno de 20x20 (área 400 = 4% > 3%)
            m = np.zeros((192, 192), dtype=bool)
            m[40:140, 40:140] = True
            m[80:100, 80:100] = False  # hueco interno
            return Segmentacion(
                ok=True,
                mascara=m,
                cobertura=float(m.mean()),
                confianza=0.95,
                nucleo=0.95,
                solidez=0.9,
                contorno=[[[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]],
            )

    cliente.app.state.registro.segmentador = SegmentadorConHuecos()

    r = cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", foto(), "image/jpeg")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["estado"] == "no_concluyente"
    assert d["clase"] is None
    assert d["motivo"] == MOTIVO_MAIZ_AMBIGUO
