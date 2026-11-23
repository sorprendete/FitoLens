"""Pruebas de detecciÃ³n y rechazo de fuera de distribuciÃ³n (OOD) y acotamiento de confianza."""
import numpy as np
import pytest
from PIL import Image

import crear_modelos_falsos
from app.core.config import Ajustes, ajustes
from app.ia import pipeline
from app.ia.modelo import Salida
from app.ia.pipeline import (
    MOTIVO_NO_PLANTA,
    MOTIVO_OTRA_PLANTA,
    MOTIVO_OOD,
    diagnosticar,
    energia,
    entropia_normalizada,
    logsumexp,
)
from app.ia.registro import cargar
from tests.conftest import foto


def enviar(cliente, datos=None, **form):
    return cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", datos or foto(), "image/jpeg")}, data=form)


def test_ood_matematicas_energia_y_entropia():
    # EntropÃ­a normalizada
    p_segura = np.zeros(10)
    p_segura[0] = 1.0
    assert entropia_normalizada(p_segura) == pytest.approx(0.0, abs=1e-5)

    p_uniforme = np.ones(10) / 10.0
    assert entropia_normalizada(p_uniforme) == pytest.approx(1.0, abs=1e-5)

    # EnergÃ­a (-logsumexp)
    # Logits confiados: [10, 0, ...] -> energÃ­a muy negativa (baja incertidumbre)
    logits_seguros = np.zeros(10)
    logits_seguros[0] = 10.0
    # Logits planos: [0, 0, ...] -> energÃ­a mayor (alta incertidumbre)
    logits_planos = np.zeros(10)
    assert energia(logits_planos) > energia(logits_seguros)


def test_ood_paso1_rechaza_no_planta_ganadora(tmp_path):
    """PASO 1: Si p(no_planta) es la mayor, estado='rechazada', motivo_codigo='no_planta'."""
    crear_modelos_falsos.crear_todos(tmp_path)
    reg = cargar(tmp_path, 1, segmentar=False)
    img = Image.new("RGB", (64, 64), (30, 120, 40))

    ids_r = reg.router.manifest.ids
    logits_sim = np.full(len(ids_r), -5.0)
    logits_sim[ids_r.index("no_planta")] = 4.0
    logits_sim[ids_r.index("otra_planta")] = 1.0
    logits_sim[ids_r.index("maiz")] = 1.0

    reg.router.predecir = lambda imagen, volteada=False: Salida(logits=logits_sim.copy(), cam=None)

    r = diagnosticar(reg, img, regla_huecos=False)
    assert r.estado == "rechazada"
    assert r.motivo_codigo == "no_planta"
    assert r.motivo == MOTIVO_NO_PLANTA
    assert r.clase is None
    assert r.cultivo is None


def test_ood_paso1_rechaza_no_planta_por_descarte(tmp_path):
    """PASO 1: Ganadora cultivo (maiz) pero suma_cultivos < 0.70 y p(no_planta) > p(otra_planta)."""
    crear_modelos_falsos.crear_todos(tmp_path)
    reg = cargar(tmp_path, 1, segmentar=False)
    img = Image.new("RGB", (64, 64), (30, 120, 40))

    ids_r = reg.router.manifest.ids
    logits_sim = np.full(len(ids_r), -5.0)
    logits_sim[ids_r.index("maiz")] = 2.0
    logits_sim[ids_r.index("no_planta")] = 1.8
    logits_sim[ids_r.index("otra_planta")] = 0.5

    reg.router.predecir = lambda imagen, volteada=False: Salida(logits=logits_sim.copy(), cam=None)

    r = diagnosticar(reg, img, regla_huecos=False)
    assert r.estado == "rechazada"
    assert r.motivo_codigo == "no_planta"
    assert r.motivo == MOTIVO_NO_PLANTA


def test_ood_paso2_rechaza_otra_planta_ganadora(tmp_path):
    """PASO 2: Si la ganadora es otra_planta, estado='rechazada', motivo_codigo='otra_planta'."""
    crear_modelos_falsos.crear_todos(tmp_path)
    reg = cargar(tmp_path, 1, segmentar=False)
    img = Image.new("RGB", (64, 64), (30, 120, 40))

    ids_r = reg.router.manifest.ids
    logits_sim = np.full(len(ids_r), -5.0)
    logits_sim[ids_r.index("otra_planta")] = 4.0
    logits_sim[ids_r.index("no_planta")] = 1.0
    logits_sim[ids_r.index("maiz")] = 1.0

    reg.router.predecir = lambda imagen, volteada=False: Salida(logits=logits_sim.copy(), cam=None)

    r = diagnosticar(reg, img, regla_huecos=False)
    assert r.estado == "rechazada"
    assert r.motivo_codigo == "otra_planta"
    assert r.motivo == MOTIVO_OTRA_PLANTA


def test_ood_paso2_rechaza_otra_planta_por_suma_baja(tmp_path):
    """PASO 2: Ganadora cultivo (tomate) pero suma_cultivos < 0.70 y p(otra_planta) >= p(no_planta)."""
    crear_modelos_falsos.crear_todos(tmp_path)
    reg = cargar(tmp_path, 1, segmentar=False)
    img = Image.new("RGB", (64, 64), (30, 120, 40))

    ids_r = reg.router.manifest.ids
    logits_sim = np.full(len(ids_r), -5.0)
    logits_sim[ids_r.index("tomate")] = 2.0
    logits_sim[ids_r.index("otra_planta")] = 1.8
    logits_sim[ids_r.index("no_planta")] = 0.5

    reg.router.predecir = lambda imagen, volteada=False: Salida(logits=logits_sim.copy(), cam=None)

    r = diagnosticar(reg, img, regla_huecos=False)
    assert r.estado == "rechazada"
    assert r.motivo_codigo == "otra_planta"
    assert r.motivo == MOTIVO_OTRA_PLANTA


def test_ood_admite_cultivo_soportado_con_alta_probabilidad(tmp_path):
    """Admite cultivo soportado si ganadora es cultivo y suma_cultivos >= 0.70."""
    crear_modelos_falsos.crear_todos(tmp_path)
    reg = cargar(tmp_path, 1, segmentar=False)
    img = Image.new("RGB", (64, 64), (30, 120, 40))

    ids_r = reg.router.manifest.ids
    logits_sim = np.full(len(ids_r), -5.0)
    logits_sim[ids_r.index("tomate")] = 5.0

    reg.router.predecir = lambda imagen, volteada=False: Salida(logits=logits_sim.copy(), cam=None)

    r = diagnosticar(reg, img, regla_huecos=False)
    assert r.estado == "diagnostico"
    assert r.cultivo == "tomate"
    assert r.clase is not None


def test_ood_rechazo_por_prob_ajena(tmp_path):
    """Simula una foto donde router da maÃ­z pero suma_cultivos < 0.70 y prob(otra) > prob(no_planta)."""
    crear_modelos_falsos.crear_todos(tmp_path)
    reg = cargar(tmp_path, 1, segmentar=False)
    img = Image.new("RGB", (64, 64), (30, 120, 40))

    # Logits: maiz=2.0, otra_planta=1.8, no_planta=1.0, resto=0.0
    logits_sim = np.zeros(10)
    ids_r = reg.router.manifest.ids
    logits_sim[ids_r.index("maiz")] = 2.0
    logits_sim[ids_r.index("otra_planta")] = 1.8
    logits_sim[ids_r.index("no_planta")] = 1.0

    reg.router.predecir = lambda imagen, volteada=False: Salida(logits=logits_sim.copy(), cam=None)

    r = diagnosticar(reg, img, regla_huecos=False)
    assert r.estado == "rechazada"
    assert r.clase is None
    assert r.cultivo is None
    assert r.motivo == MOTIVO_OOD
    assert r.motivo_codigo == "otra_planta"


def test_ood_rechazo_por_baja_prob_cultivo(tmp_path):
    """El router escoge maÃ­z pero suma_cultivos < 0.70. Debe rechazarse en Paso 2."""
    crear_modelos_falsos.crear_todos(tmp_path)
    reg = cargar(tmp_path, 1, segmentar=False)
    img = Image.new("RGB", (64, 64), (30, 120, 40))

    ids_r = reg.router.manifest.ids
    logits_sim = np.zeros(len(ids_r))
    logits_sim[ids_r.index("maiz")] = 1.2
    logits_sim[ids_r.index("otra_planta")] = 1.1
    logits_sim[ids_r.index("no_planta")] = 0.5
    reg.router.predecir = lambda imagen, volteada=False: Salida(logits=logits_sim.copy(), cam=None)

    r = diagnosticar(reg, img, regla_huecos=False)
    assert r.estado == "rechazada"
    assert r.clase is None
    assert r.cultivo is None
    assert r.motivo == MOTIVO_OOD
    assert r.motivo_codigo == "otra_planta"


def test_ood_rechazo_por_energia_router(tmp_path, monkeypatch):
    """Si se calibra U3, energÃ­a del router superior a U3 rechaza la foto."""
    crear_modelos_falsos.crear_todos(tmp_path)
    reg = cargar(tmp_path, 1, segmentar=False)
    img = Image.new("RGB", (64, 64), (30, 120, 40))

    # Ajustamos U3 a un valor bajo para forzar rechazo por energÃ­a
    monkeypatch.setattr("app.ia.pipeline.ajustes", lambda: Ajustes.model_construct(ood_u3=-1e9))

    # Logits normales con favorita tomate (energÃ­a alrededor de -10.0 > -15.0)
    r = diagnosticar(reg, img, regla_huecos=False)
    assert r.estado == "rechazada"
    assert r.clase is None


def test_ood_rechazo_por_energia_especialista(tmp_path, monkeypatch):
    """Si se calibra U4, energÃ­a del especialista superior a U4 rechaza la foto."""
    crear_modelos_falsos.crear_todos(tmp_path)
    reg = cargar(tmp_path, 1, segmentar=False)
    img = Image.new("RGB", (64, 64), (30, 120, 40))

    # Router seguro en tomate (pasa U1 y U2)
    # Ajustamos U4 a un umbral exigente
    monkeypatch.setattr("app.ia.pipeline.ajustes", lambda: Ajustes.model_construct(ood_u4=-1e9))

    r = diagnosticar(reg, img, regla_huecos=False)
    assert r.estado == "rechazada"
    assert r.clase is None
    assert r.motivo == MOTIVO_OOD


def test_confianza_combinada_y_tope_99(cliente):
    """Verifica que la confianza nunca exceda 0.99 y combine router * especialista."""
    r = enviar(cliente)
    assert r.status_code == 200
    d = r.json()
    assert d["estado"] == "diagnostico"
    assert d["confianza"] <= 0.99
    for t in d["top3"]:
        assert t["confianza"] <= 0.99


def test_endpoint_diagnostico_rechaza_planta_ajena(cliente, tmp_path):
    """VÃ­a HTTP (/api/diagnostico): router con sesgo que simula planta no soportada."""
    ids = [c for c, _ in crear_modelos_falsos.CLASES["router"]]
    sesgo_router = np.zeros(len(ids))
    sesgo_router[ids.index("otra_planta")] = 3.0

    crear_modelos_falsos.crear(tmp_path, "router", sesgo=sesgo_router)
    crear_modelos_falsos.crear(tmp_path, "hortalizas", favorita="tomate_tizon_tardio")
    crear_modelos_falsos.crear(tmp_path, "cafe", favorita="cafe_roya")
    crear_modelos_falsos.crear(tmp_path, "cacao", favorita="cacao_monilia")
    crear_modelos_falsos.crear(tmp_path, "maiz", favorita="maiz_gusano_cogollero")
    crear_modelos_falsos.crear(tmp_path, "citricos", favorita="naranja_hlb")

    cliente.app.state.registro = cargar(tmp_path, 1)
    res = enviar(cliente).json()

    assert res["estado"] == "rechazada"
    assert res["clase"] is None
    assert res["cultivo"] is None
    assert res["motivo"] == MOTIVO_OOD
    assert res["motivo_codigo"] == "otra_planta"

    from app.db.modelos import Auditoria
    from app.db.sesion import fabrica
    with fabrica()() as s:
        ev = s.query(Auditoria).filter_by(accion="diagnostico").order_by(Auditoria.id.desc()).first()
        assert ev is not None
        assert "motivo_codigo=otra_planta" in ev.detalle
        assert "prob_cultivos=" in ev.detalle
        assert "prob_otra=" in ev.detalle
        assert "prob_no_planta=" in ev.detalle
        assert "energia=" in ev.detalle


def test_endpoint_diagnostico_rechaza_no_planta(cliente, tmp_path):
    """VÃ­a HTTP (/api/diagnostico): router con sesgo que simula foto que no es planta."""
    ids = [c for c, _ in crear_modelos_falsos.CLASES["router"]]
    sesgo_router = np.zeros(len(ids))
    sesgo_router[ids.index("no_planta")] = 3.0

    crear_modelos_falsos.crear(tmp_path, "router", sesgo=sesgo_router)
    cliente.app.state.registro = cargar(tmp_path, 1)
    res = enviar(cliente).json()

    assert res["estado"] == "rechazada"
    assert res["clase"] is None
    assert res["cultivo"] is None
    assert res["motivo_codigo"] == "no_planta"
    assert res["motivo"] == MOTIVO_NO_PLANTA
