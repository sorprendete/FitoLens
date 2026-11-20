from tests.conftest import token


def test_salud(cliente):
    d = cliente.get("/api/salud").json()
    assert d["estado"] == "ok" and d["base_datos"] and set(d["modelos"]) == {"router", "hortalizas", "cafe", "cacao"}


def test_admin_inicial_y_login(cliente):
    yo = cliente.get("/api/auth/yo", headers=token(cliente)).json()
    assert yo["rol"] == "admin"
    assert cliente.post("/api/auth/login", json={"email": "admin@fitolens.pe", "password": "mala"}).status_code == 401
    assert cliente.get("/api/auth/yo", headers={"Authorization": "Bearer basura"}).status_code == 401


def test_registro_duplicado_y_cerrado(cliente, monkeypatch):
    datos = {"email": "Ana@X.pe", "nombre": "Ana", "password": "12345678"}
    assert cliente.post("/api/auth/registro", json=datos).status_code == 201
    assert cliente.post("/api/auth/registro", json=datos).status_code == 409
    from app.core.config import ajustes
    monkeypatch.setattr(ajustes(), "registro_abierto", False)
    assert cliente.post("/api/auth/registro", json={**datos, "email": "b@x.pe"}).status_code == 403
