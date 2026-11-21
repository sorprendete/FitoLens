"""Pruebas de las reglas de ambigüedad de maíz (probabilidades y detección de huecos de gusano cogollero)."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from app.ia.pipeline import MOTIVO_HUECOS_MAIZ, MOTIVO_MAIZ_AMBIGUO
from app.ia.registro import cargar
from app.ia.segmentacion import Segmentacion, huecos_mordedura
import crear_modelos_falsos
from tests.conftest import foto


class SegmentadorMock:
    def __init__(self, mascara: np.ndarray):
        self.mascara = mascara

    def segmentar(self, imagen):
        m = self.mascara
        return Segmentacion(
            ok=True,
            mascara=m,
            cobertura=float(m.mean()),
            confianza=0.95,
            nucleo=0.95,
            solidez=0.9,
            contorno=[[[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]],
        )


def _preparar_cliente(cliente, tmp_path, mascara=None):
    crear_modelos_falsos.crear_todos(tmp_path, cultivo_router="maiz")
    # maiz con favorita="maiz_tizon_hoja" da > 98% a tizón y cogollero < 1%
    crear_modelos_falsos.crear(tmp_path, "maiz", favorita="maiz_tizon_hoja")
    cliente.app.state.registro = cargar(tmp_path, 1, segmentar=False)
    if mascara is not None:
        cliente.app.state.registro.segmentador = SegmentadorMock(mascara)


def test_tizon_claro_sigue_saliendo_tizon(cliente, tmp_path):
    """Tizón con confianza alta y cogollero lejos debe diagnosticarse como tizón."""
    _preparar_cliente(cliente, tmp_path)

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


def test_hoja_sin_huecos_no_cambia(cliente, tmp_path):
    """Hoja sin huecos: no se altera la decisión del modelo (sigue siendo tizón)."""
    m = np.zeros((192, 192), dtype=bool)
    m[40:140, 40:140] = True
    _preparar_cliente(cliente, tmp_path, m)

    r = cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", foto(), "image/jpeg")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["estado"] == "diagnostico"
    assert d["cultivo"] == "maiz"
    assert d["clase"] == "maiz_tizon_hoja"
    assert d["motivo"] is None


def test_mascara_con_1_hueco_chico_no_cambia(cliente, tmp_path):
    """Máscara con 1 hueco chico (1 % del área de la hoja, no fuerte) no cambia a cogollero."""
    m = np.zeros((192, 192), dtype=bool)
    m[40:140, 40:140] = True
    m[85:95, 85:95] = False  # 1 hueco interno de 10x10 = 100 px (1 % de 10000)
    _preparar_cliente(cliente, tmp_path, m)

    r = cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", foto(), "image/jpeg")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["estado"] == "diagnostico"
    assert d["cultivo"] == "maiz"
    assert d["clase"] == "maiz_tizon_hoja"
    assert d["motivo"] is None


def test_mascara_con_4_huecos_encerrados_cambia_a_cogollero(cliente, tmp_path):
    """Máscara con 4 huecos encerrados de 1 % cada uno (4 % total >= 2 %, cant 4 >= 3): cambia a cogollero."""
    m = np.zeros((192, 192), dtype=bool)
    m[40:140, 40:140] = True
    m[55:65, 55:65] = False
    m[55:65, 115:125] = False
    m[115:125, 55:65] = False
    m[115:125, 115:125] = False
    _preparar_cliente(cliente, tmp_path, m)

    r = cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", foto(), "image/jpeg")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["estado"] == "diagnostico"
    assert d["cultivo"] == "maiz"
    assert d["clase"] == "maiz_gusano_cogollero"
    assert d["confianza"] >= 0.6
    assert d["motivo"] == MOTIVO_HUECOS_MAIZ


def test_espacio_alargado_entre_dos_hojas_no_cambia(cliente, tmp_path):
    """Componente muy alargado y delgado (relación de aspecto > 6) se descarta y no cambia a cogollero."""
    m = np.zeros((192, 192), dtype=bool)
    m[40:140, 40:140] = True
    m[55:125, 88:93] = False  # 70x5 px: relación de aspecto 70 / 5 = 14 > 6
    _preparar_cliente(cliente, tmp_path, m)

    r = cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", foto(), "image/jpeg")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["estado"] == "diagnostico"
    assert d["cultivo"] == "maiz"
    assert d["clase"] == "maiz_tizon_hoja"
    assert d["motivo"] is None


def test_hueco_pegado_al_borde_no_cambia(cliente, tmp_path):
    """Hueco pegado al contorno exterior (dentro del 2 % del margen del lado) se descarta y no cambia."""
    m = np.zeros((192, 192), dtype=bool)
    m[40:140, 40:140] = True
    m[41:51, 85:95] = False  # y=41 toca la zona dilatada del borde superior (y=40)
    _preparar_cliente(cliente, tmp_path, m)

    r = cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", foto(), "image/jpeg")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["estado"] == "diagnostico"
    assert d["cultivo"] == "maiz"
    assert d["clase"] == "maiz_tizon_hoja"
    assert d["motivo"] is None


def test_huecos_mordedura_filtros_unitarios():
    """Verifica directamente la función huecos_mordedura con diferentes geometrías de máscara."""
    base = np.zeros((192, 192), dtype=bool)
    base[40:140, 40:140] = True  # Hoja 100x100 (área 10000)

    # 1. Sin huecos
    assert huecos_mordedura(base) == {"cantidad": 0, "fraccion": 0.0, "fuerte": False}

    # 2. 1 hueco chico (10x10 = 100 px = 1 %)
    m1 = base.copy()
    m1[85:95, 85:95] = False
    r1 = huecos_mordedura(m1)
    assert r1["cantidad"] == 1
    assert 0.009 <= r1["fraccion"] <= 0.011
    assert r1["fuerte"] is False

    # 3. 4 huecos encerrados de 1 % cada uno (4 % total) -> fuerte
    m4 = base.copy()
    m4[55:65, 55:65] = False
    m4[55:65, 115:125] = False
    m4[115:125, 55:65] = False
    m4[115:125, 115:125] = False
    r4 = huecos_mordedura(m4)
    assert r4["cantidad"] == 4
    assert 0.039 <= r4["fraccion"] <= 0.041
    assert r4["fuerte"] is True

    # 4. 1 hueco grande (26x26 = 676 px = 6.76 %): con el nuevo umbral exige al menos 2 huecos para fraccion >= 3 %, así que no es fuerte
    mg = base.copy()
    mg[70:96, 70:96] = False
    rg = huecos_mordedura(mg)
    assert rg["cantidad"] == 1
    assert rg["fraccion"] >= 0.06
    assert rg["fuerte"] is False

    # 4b. 2 huecos que suman >= 3 % del área -> fuerte
    m2 = base.copy()
    m2[70:90, 70:90] = False     # 400 px = 4 %
    m2[110:125, 110:125] = False # 225 px = 2.25 %
    r2 = huecos_mordedura(m2)
    assert r2["cantidad"] == 2
    assert r2["fraccion"] >= 0.03
    assert r2["fuerte"] is True

    # 5. Componente alargado (70x5, aspecto 14 > 6) -> descartado
    ma = base.copy()
    ma[55:125, 88:93] = False
    ra = huecos_mordedura(ma)
    assert ra["cantidad"] == 0
    assert ra["fuerte"] is False

    # 6. Hueco pegado al borde exterior (y=41) -> descartado
    mb = base.copy()
    mb[41:51, 85:95] = False
    rb = huecos_mordedura(mb)
    assert rb["cantidad"] == 0
    assert rb["fuerte"] is False

    # 7. Ruido muy pequeño (< 0.04 % = 4 px) -> descartado
    mr = base.copy()
    mr[80:81, 80:83] = False  # 3 px < 4 px
    rr = huecos_mordedura(mr)
    assert rr["cantidad"] == 0
    assert rr["fuerte"] is False

    # 8. Espacio no convexo en forma de U / herradura (solidez < 0.4) -> descartado
    mu = base.copy()
    mu[60:100, 60:63] = False
    mu[97:100, 60:100] = False
    mu[60:100, 97:100] = False
    ru = huecos_mordedura(mu)
    assert ru["cantidad"] == 0
    assert ru["fuerte"] is False

    # 9. Entrada inválida
    assert huecos_mordedura(None) == {"cantidad": 0, "fraccion": 0.0, "fuerte": False}
    assert huecos_mordedura(np.zeros((10, 10), bool)) == {"cantidad": 0, "fraccion": 0.0, "fuerte": False}


def test_huecos_mordedura_con_imagen_y_color():
    """Detecta huecos por color dentro de una silueta sólida cuando la imagen tiene huecos de fondo."""
    # Máscara sólida (sin huecos geométricos en la máscara)
    mascara = np.zeros((192, 192), dtype=bool)
    mascara[30:160, 30:160] = True

    # Imagen con hoja verde (70, 140, 50 con ruido) y 4 huecos de color suelo oscuro (60, 45, 30)
    rng = np.random.default_rng(42)
    arr = np.full((300, 300, 3), 225, dtype=np.uint8)
    ruido = rng.integers(-5, 6, size=(200, 200, 3), dtype=np.int16)
    arr[50:250, 50:250] = np.clip(np.array([70, 140, 50], dtype=np.int16) + ruido, 0, 255).astype(np.uint8)

    # 4 huecos de 1 % del área de la hoja (20x20 = 400 px de 40000 px), separados y lejos del borde
    for y, x in [(80, 80), (80, 190), (190, 80), (190, 190)]:
        arr[y:y + 20, x:x + 20] = (60, 45, 30)

    img = Image.fromarray(arr)

    res = huecos_mordedura(mascara, imagen=img)
    assert res["cantidad"] == 4
    assert res["fraccion"] >= 0.02
    assert res["fuerte"] is True


def test_tizon_manchas_marrones_no_se_marcan_como_huecos():
    """Manchas marrones de tizón (120, 80, 30) deben reconocerse como tejido vegetal y no como huecos."""
    mascara = np.zeros((192, 192), dtype=bool)
    mascara[30:160, 30:160] = True

    img = Image.new("RGB", (300, 300), (225, 225, 225))
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 50, 250, 250], fill=(45, 140, 45))
    # Manchas de tizón (color marrón necrótico típico)
    draw.rectangle([80, 80, 130, 130], fill=(120, 80, 30))
    draw.rectangle([170, 170, 210, 210], fill=(130, 85, 35))

    res = huecos_mordedura(mascara, imagen=img)
    assert res["cantidad"] == 0
    assert res["fraccion"] == 0.0
    assert res["fuerte"] is False


def test_ronald_huecos_foto_real_si_existe():
    """La foto real ronald_huecos.jpg debe detectarse como daño fuerte de cogollero."""
    raiz = Path(__file__).resolve().parents[1]
    ruta_ronald = raiz / "pruebas" / "huecos" / "fotos" / "maiz_gusano_cogollero" / "ronald_huecos.jpg"
    if not ruta_ronald.exists():
        return
    img = Image.open(ruta_ronald).convert("RGB")
    # Silueta que cubre la zona central de la hoja
    m = np.zeros((192, 192), dtype=bool)
    m[10:182, 40:152] = True
    res = huecos_mordedura(m, imagen=img)
    assert res["cantidad"] >= 4
    assert res["fraccion"] >= 0.008
    assert res["fuerte"] is True


def test_mancha_gris_con_huecos_fuertes_no_cambia_a_cogollero(cliente, tmp_path):
    """La clase maiz_mancha_gris no debe cambiar a cogollero aunque haya huecos fuertes."""
    crear_modelos_falsos.crear_todos(tmp_path, cultivo_router="maiz")
    crear_modelos_falsos.crear(tmp_path, "maiz", favorita="maiz_mancha_gris")
    cliente.app.state.registro = cargar(tmp_path, 1, segmentar=False)

    # Máscara con 4 huecos encerrados (daño fuerte)
    m = np.zeros((192, 192), dtype=bool)
    m[40:140, 40:140] = True
    m[55:65, 55:65] = False
    m[55:65, 115:125] = False
    m[115:125, 55:65] = False
    m[115:125, 115:125] = False
    cliente.app.state.registro.segmentador = SegmentadorMock(m)

    r = cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", foto(), "image/jpeg")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["estado"] == "diagnostico"
    assert d["cultivo"] == "maiz"
    assert d["clase"] == "maiz_mancha_gris"
    assert d["motivo"] is None
