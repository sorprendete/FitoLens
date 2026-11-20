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


def test_salud_indica_modelos_de_prueba(cliente):
    d = cliente.get("/api/salud").json()
    assert d["modelos_de_prueba"] is True and "modelos_release" in d


def test_ip_real_tiene_prioridad_sobre_x_forwarded_for():
    from starlette.requests import Request
    from app.seguridad.auditoria import ip_cliente

    def req(cabeceras):
        return Request({"type": "http", "headers": [(k.encode(), v.encode()) for k, v in cabeceras.items()],
                        "client": ("172.18.0.1", 1)})
    # Detrás de nginx + Caddy: la última entrada de X-Forwarded-For es el proxy, X-Real-IP el visitante.
    assert ip_cliente(req({"x-real-ip": "190.1.2.3", "x-forwarded-for": "190.1.2.3, 172.18.0.1"})) == "190.1.2.3"
    assert ip_cliente(req({"x-forwarded-for": "telegram-7"})) == "telegram-7"
    assert ip_cliente(req({})) == "172.18.0.1"
