from tests.conftest import foto, token


def usuario(cliente, email="agri@x.pe"):
    cliente.post("/api/auth/registro", json={"email": email, "nombre": "Agri", "password": "12345678"})
    return token(cliente, email, "12345678")


def diagnosticar(cliente, h):
    r = cliente.post("/api/diagnostico", headers=h, files={"imagen": ("h.jpg", foto(), "image/jpeg")})
    return r.json()["id"]  # modelos falsos: tomate_tizon_tardio (enferma)


def test_crear_y_validar(cliente):
    h = usuario(cliente)
    assert cliente.get("/api/parcelas").status_code == 401
    r = cliente.post("/api/parcelas", headers=h, json={"nombre": "Huerta baja", "cultivo": "tomate", "provincia": "lamas"})
    assert r.status_code == 201 and r.json()["tendencia"] == "sin_datos"
    assert cliente.post("/api/parcelas", headers=h, json={"nombre": "X1", "cultivo": "mango"}).status_code == 400
    assert cliente.post("/api/parcelas", headers=h, json={"nombre": "X1", "cultivo": "cafe", "provincia": "lima"}).status_code == 400
    assert [p["nombre"] for p in cliente.get("/api/parcelas", headers=h).json()["items"]] == ["Huerta baja"]


def test_linea_de_tiempo_y_tendencia(cliente):
    h = usuario(cliente)
    pid = cliente.post("/api/parcelas", headers=h, json={"nombre": "Lote 1", "cultivo": "tomate"}).json()["id"]
    did = diagnosticar(cliente, h)
    url = f"/api/parcelas/{pid}/visitas"
    # Foto enferma sin severidad: hay que indicarla
    assert cliente.post(url, headers=h, json={"diagnostico_id": did}).status_code == 422
    v = cliente.post(url, headers=h, json={"diagnostico_id": did, "severidad": 3, "tratamiento": "Fungicida sistémico",
                                           "fecha": "2026-11-01T10:00:00Z"})
    assert v.status_code == 201 and v.json()["clase"] == "tomate_tizon_tardio"
    assert cliente.post(url, headers=h, json={"diagnostico_id": did, "severidad": 2}).status_code == 409
    cliente.post(url, headers=h, json={"severidad": 2, "fecha": "2026-11-08T10:00:00Z"})
    cliente.post(url, headers=h, json={"severidad": 1, "fecha": "2026-11-15T10:00:00Z"})
    d = cliente.get(f"/api/parcelas/{pid}", headers=h).json()
    assert [x["severidad"] for x in d["historial"]] == [3, 2, 1]
    assert d["tendencia"] == "mejora" and d["severidad_actual"] == 1 and d["visitas"] == 3
    cliente.post(url, headers=h, json={"severidad": 3, "fecha": "2026-11-20T10:00:00Z"})
    assert cliente.get(f"/api/parcelas/{pid}", headers=h).json()["tendencia"] == "igual"


def test_cultivo_distinto_y_ajena(cliente):
    h = usuario(cliente)
    otro = usuario(cliente, "otro@x.pe")
    pid = cliente.post("/api/parcelas", headers=h, json={"nombre": "Cafetal", "cultivo": "cafe"}).json()["id"]
    did = diagnosticar(cliente, h)
    assert cliente.post(f"/api/parcelas/{pid}/visitas", headers=h, json={"diagnostico_id": did, "severidad": 1}).status_code == 400
    # Otro usuario no ve ni toca la parcela, ni enlaza diagnósticos ajenos
    assert cliente.get(f"/api/parcelas/{pid}", headers=otro).status_code == 404
    pid2 = cliente.post("/api/parcelas", headers=otro, json={"nombre": "Tomatal", "cultivo": "tomate"}).json()["id"]
    assert cliente.post(f"/api/parcelas/{pid2}/visitas", headers=otro, json={"diagnostico_id": did, "severidad": 1}).status_code == 404


def test_borrar_conserva_diagnosticos(cliente):
    h = usuario(cliente)
    pid = cliente.post("/api/parcelas", headers=h, json={"nombre": "Lote 2", "cultivo": "tomate"}).json()["id"]
    did = diagnosticar(cliente, h)
    vid = cliente.post(f"/api/parcelas/{pid}/visitas", headers=h, json={"diagnostico_id": did, "severidad": 2}).json()["id"]
    assert cliente.delete(f"/api/parcelas/{pid}/visitas/{vid}", headers=h).status_code == 204
    assert cliente.delete(f"/api/parcelas/{pid}", headers=h).status_code == 204
    assert cliente.get(f"/api/parcelas/{pid}", headers=h).status_code == 404
    assert any(i["id"] == did for i in cliente.get("/api/historial", headers=h).json()["items"])
