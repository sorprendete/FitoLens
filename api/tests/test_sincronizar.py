"""App sin internet: vincular el teléfono a la cuenta y subir la cola sin duplicar."""
import uuid

from tests.conftest import foto, token


def vincular(cliente, email="admin@fitolens.pe", password="clave-admin-123", nombre="Moto G de Ana"):
    return cliente.post("/api/dispositivos", json={"email": email, "password": password, "nombre_dispositivo": nombre})


def subir(cliente, cab, id_cliente=None, **form):
    datos = {"id_cliente": id_cliente or str(uuid.uuid4()), "estado": "diagnostico", "cultivo": "cafe",
             "clase": "cafe_roya", "confianza": "0.91", "modelo_version": "router 1 + cafe 1",
             "fecha": "2026-11-18T14:30:00Z", "provincia": "moyobamba", **form}
    return cliente.post("/api/sincronizar", headers=cab, data=datos,
                        files={"imagen": ("hoja.jpg", foto(), "image/jpeg")})


def cab_app(cliente, **kw):
    r = vincular(cliente, **kw)
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()


def test_vincular_da_token_largo_y_lista_dispositivos(cliente):
    import time

    import jwt
    cab, d = cab_app(cliente)
    datos = jwt.decode(d["access_token"], options={"verify_signature": False})
    assert datos["dis"] == d["dispositivo"]["id"]
    assert datos["exp"] - time.time() > 80 * 86400  # la web dura 12 h; el teléfono, 90 días
    lista = cliente.get("/api/dispositivos", headers=cab).json()
    assert [x["nombre"] for x in lista] == ["Moto G de Ana"]
    assert vincular(cliente, password="mala").status_code == 401


def test_subida_guarda_resultado_del_telefono_y_no_duplica(cliente):
    cab, _ = cab_app(cliente)
    id_ = str(uuid.uuid4())
    r1 = subir(cliente, cab, id_)
    assert r1.status_code == 200, r1.text
    assert r1.json()["nuevo"] is True
    r2 = subir(cliente, cab, id_)
    assert r2.json() == {**r1.json(), "nuevo": False}

    items = cliente.get("/api/historial", headers=cab).json()["items"]
    assert len(items) == 1
    it = items[0]
    assert it["origen"] == "app" and it["clase"] == "cafe_roya" and it["provincia"] == "moyobamba"
    assert it["creado"].startswith("2026-11-18T14:30")  # fecha de la foto, no la de subida
    # Cuenta como caso de roya en el mapa de brotes
    brotes = cliente.get("/api/brotes", params={"desde": "2026-01-01"}).json()
    assert brotes["total"] >= 1


def test_no_concluyente_no_guarda_clase(cliente):
    cab, _ = cab_app(cliente)
    assert subir(cliente, cab, estado="no_concluyente", clase="cafe_roya").status_code == 200
    it = cliente.get("/api/historial", headers=cab).json()["items"][0]
    assert it["estado"] == "no_concluyente" and it["clase"] is None


def test_fecha_increible_usa_la_de_llegada(cliente):
    cab, _ = cab_app(cliente)
    subir(cliente, cab, fecha="2099-01-01T00:00:00Z")
    it = cliente.get("/api/historial", headers=cab).json()["items"][0]
    assert not it["creado"].startswith("2099")


def test_requiere_cuenta_y_otro_usuario_no_reclama_el_mismo_id(cliente):
    assert subir(cliente, {}).status_code == 401
    cab, _ = cab_app(cliente)
    id_ = str(uuid.uuid4())
    subir(cliente, cab, id_)
    cliente.post("/api/auth/registro", json={"email": "luis@x.pe", "nombre": "Luis", "password": "12345678"})
    cab2, _ = cab_app(cliente, email="luis@x.pe", password="12345678")
    assert subir(cliente, cab2, id_).status_code == 409


def test_revocar_corta_la_sesion_del_telefono(cliente):
    cab, d = cab_app(cliente)
    web = token(cliente)
    assert cliente.delete(f"/api/dispositivos/{d['dispositivo']['id']}", headers=web).status_code == 204
    r = subir(cliente, cab)
    assert r.status_code == 401 and "vinculado" in r.json()["detail"]
    assert cliente.get("/api/dispositivos", headers=web).json() == []
