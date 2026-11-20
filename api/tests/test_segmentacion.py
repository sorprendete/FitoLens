"""Ubicación de la hoja: máscara, contorno, respaldo seguro y que nunca cambie el diagnóstico."""
import base64
import io
import time

import numpy as np
import pytest
from PIL import Image, ImageDraw

from app.ia import mapa_calor, pipeline
from app.ia.segmentacion import LADO, MAX_POLIGONOS, MAX_PUNTOS, Segmentacion, Segmentador, analizar
from tests.conftest import foto


def hoja_sintetica(ancho=640, alto=480, fondo=(235, 235, 230)) -> tuple[Image.Image, np.ndarray]:
    img = Image.new("RGB", (ancho, alto), fondo)
    caja = (ancho * 0.25, alto * 0.2, ancho * 0.75, alto * 0.8)
    ImageDraw.Draw(img).ellipse(caja, fill=(50, 130, 45))
    ImageDraw.Draw(img).ellipse((ancho * 0.45, alto * 0.45, ancho * 0.52, alto * 0.53), fill=(120, 80, 30))  # lesión
    verdad = Image.new("L", (ancho, alto))
    ImageDraw.Draw(verdad).ellipse(caja, fill=255)
    return img, np.asarray(verdad) > 0


def elipse(cx=0.5, cy=0.5, rx=0.25, ry=0.3, lado=LADO) -> np.ndarray:
    y, x = np.mgrid[0:lado, 0:lado] / lado
    return (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1).astype(np.float32)


@pytest.fixture(scope="module")
def seg():
    s = Segmentador.cargar(hilos=1)
    assert s is not None
    return s


# --- Reglas sobre la probabilidad (sin modelo) ---

def test_mascara_nitida_da_contorno_normalizado():
    r = analizar(elipse())
    assert r.ok and r.motivo is None
    assert 0.2 < r.cobertura < 0.3 and r.confianza > 0.95
    assert len(r.contorno) == 1 and 8 <= len(r.contorno[0]) <= MAX_PUNTOS
    xs, ys = np.array(r.contorno[0]).T
    assert xs.min() == pytest.approx(0.25, abs=0.02) and xs.max() == pytest.approx(0.75, abs=0.02)
    assert ys.min() == pytest.approx(0.2, abs=0.02) and ys.max() == pytest.approx(0.8, abs=0.02)


def test_varias_hojas_y_motas():
    p = np.maximum(elipse(0.25, 0.5, 0.15, 0.3), elipse(0.75, 0.5, 0.15, 0.3))
    p[5:8, 5:8] = 1  # mota suelta: se descarta
    r = analizar(p)
    assert r.ok and len(r.contorno) == 2 and len(r.contorno) <= MAX_POLIGONOS


@pytest.mark.parametrize("p, motivo", [
    (np.zeros((LADO, LADO), np.float32), "vacia"),
    (elipse(rx=0.05, ry=0.05), "muy_pequena"),
    (np.ones((LADO, LADO), np.float32), "toda_la_foto"),
    (np.full((LADO, LADO), 0.55, np.float32), "toda_la_foto"),
    (np.clip(elipse() * 0.3 + 0.35, 0, 1), "dudosa"),  # todo ronda 0.5: el modelo duda
])
def test_respaldo_cuando_la_mascara_no_sirve(p, motivo):
    r = analizar(p)
    assert not r.ok and r.motivo == motivo and r.contorno == []


def test_ruido_aleatorio_no_da_contorno():
    rng = np.random.default_rng(0)
    for _ in range(20):
        r = analizar(rng.random((LADO, LADO), np.float32))
        assert not r.ok


# --- Modelo real (U2-Net-p) ---

def test_ubica_hoja_sintetica(seg):
    img, verdad = hoja_sintetica()
    r = seg.segmentar(img)
    assert r.ok, r.motivo
    m = np.asarray(Image.fromarray(r.mascara).resize(img.size, Image.NEAREST))
    iou = (m & verdad).sum() / (m | verdad).sum()
    assert iou > 0.85


def test_rapido_en_cpu(seg):
    img, _ = hoja_sintetica()
    seg.segmentar(img)
    tiempos = []
    for _ in range(5):
        t = time.perf_counter()
        seg.segmentar(img)
        tiempos.append(time.perf_counter() - t)
    assert sorted(tiempos)[2] < 0.3  # mediana, 1 hilo y máquina de pruebas cargada


def test_foto_sin_objeto_no_inventa_contorno(seg):
    for color in [(240, 240, 240), (40, 140, 50), (0, 0, 0)]:
        assert not seg.segmentar(Image.new("RGB", (300, 200), color)).ok


def test_modelo_ausente_o_alterado_desactiva_sin_romper(tmp_path):
    assert Segmentador.cargar(ruta=tmp_path / "no_existe.onnx") is None
    falso = tmp_path / "u2netp_192.onnx"
    falso.write_bytes(b"alterado")
    assert Segmentador.cargar(ruta=falso) is None


def test_error_interno_devuelve_respaldo(seg, monkeypatch):
    monkeypatch.setattr(seg, "probabilidad", lambda _: (_ for _ in ()).throw(RuntimeError("x")))
    r = seg.segmentar(Image.new("RGB", (50, 50)))
    assert not r.ok and r.motivo.startswith("error")


# --- Mapa de calor recortado ---

def test_mapa_de_calor_solo_sobre_la_hoja():
    cam = np.ones((8, 8), np.float32)
    cam[3:5, 3:5] = 2  # algo de atención en la hoja
    cam[0, 0] = 5  # el pico cae fuera de la hoja
    mascara = elipse() > 0.5
    png = mapa_calor.png_base64(cam, 400, 300, mascara=mascara)
    alfa = np.asarray(Image.open(io.BytesIO(base64.b64decode(png))))[..., 3]
    assert alfa.shape == (300, 400)
    assert alfa[:20, :20].max() == 0 and alfa[:, :60].max() == 0  # fuera de la hoja: transparente
    assert alfa[150, 200] > 0  # dentro: visible (renormalizado)


def test_fraccion_de_atencion_dentro():
    mascara = elipse() > 0.5
    dentro = np.zeros((8, 8), np.float32)
    dentro[3:5, 3:5] = 1
    fuera = np.zeros((8, 8), np.float32)
    fuera[0, 0] = 1
    assert mapa_calor.fraccion_dentro(dentro, mascara) > 0.8
    assert mapa_calor.fraccion_dentro(fuera, mascara) < 0.1


# --- Pipeline: nunca cambia el diagnóstico, nunca lo rompe ---

class _Fijo:
    def __init__(self, r: Segmentacion | None = None, espera: float = 0, error: bool = False):
        self.r, self.espera, self.error = r, espera, error

    def segmentar(self, _):
        time.sleep(self.espera)
        if self.error:
            raise RuntimeError("falla")
        return self.r


def _registro(cliente):
    return cliente.app.state.registro


def _sin_cambios(a, b):
    assert (a.estado, a.clase, a.confianza, a.top3) == (b.estado, b.clase, b.confianza, b.top3)


def test_diagnostico_identico_con_y_sin_segmentacion(cliente):
    reg = _registro(cliente)
    for img in (hoja_sintetica()[0], Image.open(io.BytesIO(foto(400, 300)))):
        _sin_cambios(pipeline.diagnosticar(reg, img), pipeline.diagnosticar(reg, img, segmentador=None))
    sin = pipeline.diagnosticar(reg, hoja_sintetica()[0], segmentador=None)
    assert "segmentacion" not in [p["id"] for p in sin.pasos] and not sin.mascara_ok


@pytest.mark.parametrize("falso", [_Fijo(error=True), _Fijo(Segmentacion(ok=False, motivo="dudosa")),
                                   _Fijo(Segmentacion(ok=True, mascara=elipse() > 0.5), espera=0.5)])
def test_fallos_de_segmentacion_no_rompen_el_diagnostico(cliente, monkeypatch, falso):
    monkeypatch.setattr(pipeline, "ESPERA_MAXIMA_S", 0.1)
    reg = _registro(cliente)
    img = hoja_sintetica()[0]
    r = pipeline.diagnosticar(reg, img, segmentador=falso)
    _sin_cambios(r, pipeline.diagnosticar(reg, img, segmentador=None))
    assert not r.mascara_ok and r.contorno_hoja == [] and r.mapa_calor_png_base64
    assert "foto completa" in next(p for p in r.pasos if p["id"] == "segmentacion")["detalle"]


def test_mascara_lejos_de_la_atencion_se_descarta(cliente, monkeypatch):
    reg = _registro(cliente)
    esquina = np.zeros((LADO, LADO), bool)
    esquina[:40, :40] = True
    falso = _Fijo(Segmentacion(ok=True, mascara=esquina, contorno=[[[0, 0], [0.2, 0], [0.2, 0.2]]]))
    monkeypatch.setattr(mapa_calor, "fraccion_dentro", lambda *_: 0.1)
    r = pipeline.diagnosticar(reg, hoja_sintetica()[0], segmentador=falso)
    assert not r.mascara_ok and r.contorno_hoja == []


def test_api_devuelve_contorno(cliente):
    img, _ = hoja_sintetica()
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    d = cliente.post("/api/diagnostico", files={"imagen": ("h.jpg", buf.getvalue(), "image/jpeg")}).json()
    assert isinstance(d["mascara_ok"], bool) and isinstance(d["contorno_hoja"], list)
    paso = next(p for p in d["pasos"] if p["id"] == "segmentacion")
    if d["mascara_ok"]:
        assert d["contorno_hoja"] and all(0 <= v <= 1 for poli in d["contorno_hoja"] for pt in poli for v in pt)
    else:
        assert d["contorno_hoja"] == [] and "foto completa" in paso["detalle"]


def test_segmentacion_desactivada_por_entorno(tmp_path, dir_modelos):
    from app.ia.registro import cargar
    assert cargar(dir_modelos, 1, segmentar=False).segmentador is None
