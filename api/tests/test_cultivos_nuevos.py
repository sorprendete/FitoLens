"""Maíz y cítricos con modelos falsos: enrutado, consejos y PDF, y que las 4 copias del catálogo coincidan."""
import re
from pathlib import Path

import pytest
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
NUEVOS = {
    "maiz": ["maiz_sana", "maiz_tizon_hoja", "maiz_roya_comun", "maiz_mancha_gris", "maiz_gusano_cogollero"],
    **{c: [f"{c}_{e}" for e in ("sana", "cancrosis", "hlb", "mancha_negra", "melanosis", "sarna", "fumagina", "minador")]
       for c in ("limon", "naranja")},
}


@pytest.mark.parametrize("cultivo,favorita,modelo", [("maiz", "maiz_gusano_cogollero", "maiz"), ("naranja", "naranja_hlb", "citricos")])
def test_router_envia_al_especialista_nuevo(tmp_path, cultivo, favorita, modelo):
    import crear_modelos_falsos
    from app.ia import pipeline
    from app.ia.registro import cargar
    crear_modelos_falsos.crear_todos(tmp_path, cultivo_router=cultivo)
    reg = cargar(tmp_path, 1, segmentar=False)
    r = pipeline.diagnosticar(reg, Image.new("RGB", (64, 64), (40, 140, 50)))
    assert r.estado == "diagnostico" and r.cultivo == cultivo and r.clase == favorita
    assert all(t["clase"].startswith(cultivo + "_") for t in r.top3)
    assert r.modelo_version == f"router@0.0.1-falso+{modelo}@0.0.1-falso"
    assert f"{len(NUEVOS[cultivo])} condiciones" in r.pasos[1]["detalle"]


def test_consejos_y_pdf_de_clases_nuevas():
    from app.reporte.consejos import CLASES, CULTIVOS
    assert (CULTIVOS["maiz"], CULTIVOS["limon"], CULTIVOS["naranja"]) == ("Maíz", "Limón", "Naranja")
    for ids in NUEVOS.values():
        for i in ids:
            nombre, agente, consejo, urgencia = CLASES[i]
            assert consejo and urgencia in ("ninguna", "media", "alta", "critica")
            assert (urgencia == "ninguna") == i.endswith("_sana")
    from app.reporte.pdf import _texto
    for i in NUEVOS["limon"]:  # la fuente del PDF es latin-1: ñ, ë, tildes deben pasar sin romper
        _texto(" ".join(x for x in CLASES[i][:3] if x))


def test_parcelas_aceptan_cultivos_nuevos():
    from app.rutas.parcelas import CULTIVOS
    assert {"maiz", "limon", "naranja"} <= set(CULTIVOS)


def _ids_js(ruta: Path) -> set[str]:
    return set(re.findall(r"^\s+([a-z]+_[a-z_]+): [A-Z]", ruta.read_text(), re.M))


def test_las_cuatro_copias_del_catalogo_coinciden():
    from app.reporte.consejos import CLASES as API
    import importlib.util
    spec = importlib.util.spec_from_file_location("bot_consejos", RAIZ / "bot/app/consejos.py")
    bot = importlib.util.module_from_spec(spec); spec.loader.exec_module(bot)
    web = _ids_js(RAIZ / "web/src/datos/clases.js")
    app = _ids_js(RAIZ / "app/src/catalogo.ts")
    assert set(API) == set(bot.CLASES) == web == app
    assert API == bot.CLASES


def test_catalogo_cubre_las_clases_de_los_modelos_reales():
    """Si un modelo real trae una clase sin consejo, la web diría 'Consulta a un agrónomo'."""
    from app.ia.manifest import Manifest
    from app.reporte.consejos import CLASES
    faltan = []
    for m in (RAIZ / "modelos").glob("*/manifest.json"):
        man = Manifest.model_validate_json(m.read_text())
        if man.tipo == "especialista":
            faltan += [c.id for c in man.clases if c.id not in CLASES]
    assert not faltan, f"Clases sin consejo: {faltan}"
