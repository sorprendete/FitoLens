from tests.conftest import foto, token

ADMIN = "admin@fitolens.pe"


def registrar(cliente, email="ana@x.pe"):
    r = cliente.post("/api/auth/registro", json={"email": email, "nombre": "Ana", "password": "12345678"})
    return r.json()["usuario"]["id"], {"Authorization": f"Bearer {r.json()['access_token']}"}


def login(cliente, email, password, ip="1.1.1.1"):
    return cliente.post("/api/auth/login", json={"email": email, "password": password},
                        headers={"X-Forwarded-For": ip})


def test_fuerza_bruta_por_correo(cliente):
    for _ in range(5):
        assert login(cliente, ADMIN, "mala").status_code == 401
    # Bloqueado aunque ahora la clave sea correcta, y desde otra IP
    assert login(cliente, ADMIN, "clave-admin-123", ip="2.2.2.2").status_code == 429


def test_fuerza_bruta_por_ip_tolera_wifi_compartido(cliente):
    for i in range(19):
        login(cliente, f"u{i}@x.pe", "mala", ip="9.9.9.9")
    assert login(cliente, ADMIN, "clave-admin-123", ip="9.9.9.9").status_code == 200
    login(cliente, "otro@x.pe", "mala", ip="9.9.9.9")
    assert login(cliente, ADMIN, "clave-admin-123", ip="9.9.9.9").status_code == 429


def test_solo_admin_entra_al_panel(cliente):
    _, ana = registrar(cliente)
    for ruta in ("resumen", "usuarios", "auditoria", "amenazas?simulado=true"):
        assert cliente.get(f"/api/admin/{ruta}", headers=ana).status_code == 403
        assert cliente.get(f"/api/admin/{ruta}").status_code == 401
        assert cliente.get(f"/api/admin/{ruta}", headers=token(cliente)).status_code == 200


def test_desactivar_cuenta_corta_el_acceso(cliente):
    ana_id, ana = registrar(cliente)
    adm = token(cliente)
    r = cliente.post(f"/api/admin/usuarios/{ana_id}/estado", json={"activo": False}, headers=adm)
    assert r.json() == {"id": ana_id, "activo": False}
    assert cliente.get("/api/auth/yo", headers=ana).status_code == 401  # su token deja de servir
    assert login(cliente, "ana@x.pe", "12345678").status_code == 403
    yo = cliente.get("/api/auth/yo", headers=adm).json()["id"]
    assert cliente.post(f"/api/admin/usuarios/{yo}/estado", json={"activo": False}, headers=adm).status_code == 400
    assert cliente.post("/api/admin/usuarios/999/estado", json={"activo": False}, headers=adm).status_code == 404


def test_auditoria_resumen_y_usuarios(cliente):
    ana_id, ana = registrar(cliente)
    login(cliente, "ana@x.pe", "mala")
    cliente.post("/api/diagnostico", files={"imagen": ("h.jpg", foto(), "image/jpeg")}, headers=ana)
    adm = token(cliente)
    eventos = cliente.get("/api/admin/auditoria", headers=adm).json()
    acciones = {(e["accion"], e["estado"]) for e in eventos}
    assert {("registro", "exito"), ("login", "fallo"), ("diagnostico", "exito"), ("login", "exito")} <= acciones
    assert all(e["accion"] == "login" for e in cliente.get("/api/admin/auditoria?accion=login", headers=adm).json())
    res = cliente.get("/api/admin/resumen", headers=adm).json()
    assert res["usuarios"] == 2 and res["analisis"] == 1 and res["enfermos"] == 1 and res["logins_fallidos_24h"] == 1
    ana_fila = next(u for u in cliente.get("/api/admin/usuarios", headers=adm).json() if u["id"] == ana_id)
    assert ana_fila["diagnosticos"] == 1 and ana_fila["ultimo_acceso"]


def test_amenazas_simuladas_y_reales(cliente):
    adm = token(cliente)
    sim = cliente.get("/api/admin/amenazas?simulado=true", headers=adm).json()
    assert sim["fuente"] == "simulado" and sim["modelo"]["entrenado"] and sim["resumen"]["alto"] >= 1
    tipos = sim["resumen"]["por_tipo"]
    assert "Fuerza bruta" in tipos and "Sondeo del modelo" in tipos
    real = cliente.get("/api/admin/amenazas", headers=adm).json()
    assert real["fuente"] == "real" and real["resumen"]["eventos"] >= 1


def test_ip_de_x_forwarded_for_no_se_falsifica(cliente):
    login(cliente, ADMIN, "mala", ip="6.6.6.6, 5.5.5.5")
    e = cliente.get("/api/admin/auditoria?estado=fallo", headers=token(cliente)).json()[0]
    assert e["ip"] == "5.5.5.5"
