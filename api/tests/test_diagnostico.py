import base64
import io

from PIL import Image

from tests.conftest import foto, token


def enviar(cliente, datos=None, **form):
    return cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", datos or foto(), "image/jpeg")},
                        data=form)


def test_diagnostico_completo(cliente):
    r = enviar(cliente, provincia="moyobamba")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["estado"] == "diagnostico"
    assert d["cultivo"] == "tomate"
    assert d["clase"] == "tomate_tizon_tardio"
    assert 0.3 <= d["confianza"] <= 1
    # Solo clases del cultivo elegido por el router, y renormalizadas
    assert all(t["clase"].startswith("tomate_") for t in d["top3"])
    assert [p["id"] for p in d["pasos"]] == ["router", "especialista", "calibracion", "segmentacion", "mapa_calor"]
    assert d["modelo_version"] == "router@0.0.1-falso+hortalizas@0.0.1-falso"


def test_mapa_de_calor_rgba_mismo_encuadre(cliente):
    d = enviar(cliente, foto(400, 300)).json()
    mapa = Image.open(io.BytesIO(base64.b64decode(d["mapa_calor_png_base64"])))
    assert mapa.mode == "RGBA"
    assert mapa.size[0] / mapa.size[1] == 400 / 300


def test_rechaza_no_planta(cliente, tmp_path, monkeypatch):
    import crear_modelos_falsos
    from app.ia.registro import cargar
    crear_modelos_falsos.crear_todos(tmp_path, cultivo_router="no_planta")
    cliente.app.state.registro = cargar(tmp_path, 1)
    d = enviar(cliente).json()
    assert d["estado"] == "rechazada" and d["clase"] is None and d["motivo"]


def test_no_concluyente_bajo_umbral(cliente, tmp_path):
    import json
    import crear_modelos_falsos
    from app.ia.registro import cargar
    crear_modelos_falsos.crear_todos(tmp_path)
    m = tmp_path / "hortalizas" / "manifest.json"
    datos = json.loads(m.read_text())
    datos["umbral"] = 1.0
    m.write_text(json.dumps(datos))
    cliente.app.state.registro = cargar(tmp_path, 1)
    d = enviar(cliente).json()
    assert d["estado"] == "no_concluyente" and d["clase"] is None and len(d["top3"]) == 3


def test_modelo_con_hash_alterado_no_se_carga(tmp_path):
    import crear_modelos_falsos
    from app.ia.registro import cargar
    crear_modelos_falsos.crear_todos(tmp_path)
    (tmp_path / "cafe" / "model.onnx").write_bytes(b"alterado")
    reg = cargar(tmp_path, 1)
    assert "cafe" not in reg.modelos and "cafe" in reg.errores and reg.listo


def test_validacion_de_imagen(cliente):
    assert cliente.post("/api/diagnostico", files={"imagen": ("x.jpg", b"no es imagen", "image/jpeg")}).status_code == 415
    assert cliente.post("/api/diagnostico", files={"imagen": ("x.jpg", b"", "image/jpeg")}).status_code == 400
    assert enviar(cliente, foto(formato="PNG")).status_code == 200
    assert enviar(cliente, provincia="lima").status_code == 400


def test_sin_router_responde_503(cliente, tmp_path):
    from app.ia.registro import cargar
    cliente.app.state.registro = cargar(tmp_path, 1)
    assert enviar(cliente).status_code == 503


def test_brotes_y_metricas(cliente):
    for p in ("moyobamba", "moyobamba", "rioja"):
        enviar(cliente, provincia=p)
    enviar(cliente)  # sin provincia: no cuenta
    b = cliente.get("/api/brotes").json()
    assert b["total"] == 3
    assert b["provincias"][0] == {"provincia": "moyobamba", "total": 2, "por_clase": {"tomate_tizon_tardio": 2}}
    m = cliente.get("/api/metricas").json()["modelos"]
    assert {x["id"] for x in m} == {"router", "hortalizas", "cafe", "cacao"}
    assert "campo" in m[0]


def test_historial_por_usuario(cliente):
    r = cliente.post("/api/auth/registro", json={"email": "ana@x.pe", "nombre": "Ana", "password": "12345678"})
    assert r.status_code == 201
    ana = {"Authorization": f"Bearer {r.json()['access_token']}"}
    enviar(cliente)  # anónimo
    cliente.post("/api/diagnostico", files={"imagen": ("h.jpg", foto(), "image/jpeg")}, headers=ana)
    assert len(cliente.get("/api/historial", headers=ana).json()["items"]) == 1
    assert len(cliente.get("/api/historial", headers=token(cliente)).json()["items"]) == 2
    assert cliente.get("/api/historial").status_code == 401
