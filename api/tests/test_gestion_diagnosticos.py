from sqlalchemy import select

from app.db.modelos import Auditoria, Diagnostico, Usuario, VisitaParcela
from app.db.sesion import fabrica
from tests.conftest import foto, token


def usuario(cliente, email="agri@x.pe"):
    cliente.post("/api/auth/registro", json={"email": email, "nombre": "Agri", "password": "12345678"})
    return token(cliente, email, "12345678")


def diagnosticar(cliente, h, **extra):
    r = cliente.post("/api/diagnostico", headers=h, files={"imagen": ("h.jpg", foto(), "image/jpeg")}, data=extra)
    assert r.status_code == 200
    return r.json()["id"]


def test_borrar_propio(cliente):
    h = usuario(cliente, "propio@x.pe")
    p = cliente.post("/api/parcelas", headers=h, json={"nombre": "Parcela 1", "cultivo": "tomate"}).json()
    pid = p["id"]
    did = diagnosticar(cliente, h)

    # Asociar a parcela
    r_asoc = cliente.post(f"/api/parcelas/{pid}/diagnosticos", headers=h, json={"diagnostico_id": did})
    assert r_asoc.status_code == 201

    # Verificar que está en historial
    items_antes = cliente.get("/api/historial", headers=h).json()["items"]
    assert any(item["id"] == did for item in items_antes)

    # Borrar diagnóstico propio
    r_del = cliente.delete(f"/api/historial/{did}", headers=h)
    assert r_del.status_code == 204

    # Ya no aparece en historial
    items_despues = cliente.get("/api/historial", headers=h).json()["items"]
    assert not any(item["id"] == did for item in items_despues)

    # Visitas que lo apuntaban quedan con diagnostico_id NULL
    detalle = cliente.get(f"/api/parcelas/{pid}", headers=h).json()
    assert detalle["visitas"] == 1
    assert detalle["historial"][0]["diagnostico_id"] is None

    # Auditoría registrada
    with fabrica()() as s:
        aud = s.scalars(
            select(Auditoria).where(Auditoria.accion == "diagnostico", Auditoria.detalle.contains(str(did)))
        ).first()
        assert aud is not None
        assert aud.estado == "exito"

    # Alertas y métricas no deben romperse
    assert cliente.get("/api/alertas").status_code == 200
    assert cliente.get("/api/metricas").status_code == 200


def test_borrar_ajeno_404(cliente):
    h1 = usuario(cliente, "u1@x.pe")
    h2 = usuario(cliente, "u2@x.pe")
    did1 = diagnosticar(cliente, h1)

    # Usuario 2 intenta borrar diagnóstico de Usuario 1 -> 404
    r = cliente.delete(f"/api/historial/{did1}", headers=h2)
    assert r.status_code == 404

    # Diagnóstico inexistente -> 404
    assert cliente.delete("/api/historial/999999", headers=h1).status_code == 404

    # Sin autenticación -> 401
    assert cliente.delete(f"/api/historial/{did1}").status_code == 401


def test_agregar_diagnostico_parcela(cliente):
    h = usuario(cliente, "agregar@x.pe")
    pid = cliente.post("/api/parcelas", headers=h, json={"nombre": "Tomatal", "cultivo": "tomate"}).json()["id"]
    did = diagnosticar(cliente, h)

    # Agregar con severidad y nota
    r = cliente.post(
        f"/api/parcelas/{pid}/diagnosticos",
        headers=h,
        json={"diagnostico_id": did, "severidad": 1, "nota": "Mancha foliar leve"},
    )
    assert r.status_code == 201
    v = r.json()
    assert v["diagnostico_id"] == did
    assert v["severidad"] == 1
    assert v["nota"] == "Mancha foliar leve"
    assert v["clase"] == "tomate_tizon_tardio"

    # Fecha coincide con la del diagnóstico
    with fabrica()() as s:
        diag = s.get(Diagnostico, did)
        assert v["fecha"].startswith(diag.creado.isoformat()[:19])

    # Severidad por defecto: 2 para planta enferma
    pid2 = cliente.post("/api/parcelas", headers=h, json={"nombre": "Tomatal 2", "cultivo": "tomate"}).json()["id"]
    did2 = diagnosticar(cliente, h)
    r2 = cliente.post(f"/api/parcelas/{pid2}/diagnosticos", headers=h, json={"diagnostico_id": did2})
    assert r2.status_code == 201
    assert r2.json()["severidad"] == 2

    # Severidad por defecto: 0 para planta sana
    pid3 = cliente.post("/api/parcelas", headers=h, json={"nombre": "Tomatal 3", "cultivo": "tomate"}).json()["id"]
    with fabrica()() as s:
        u = s.scalars(select(Usuario).where(Usuario.email == "agregar@x.pe")).first()
        d_sana = Diagnostico(
            usuario_id=u.id,
            origen="web",
            estado="diagnostico",
            cultivo="tomate",
            clase="tomate_sana",
            enferma=False,
            modelo_version="falso",
            imagen_sha256="sana123",
            duracion_ms=20,
        )
        s.add(d_sana)
        s.commit()
        did_sana = d_sana.id

    r3 = cliente.post(f"/api/parcelas/{pid3}/diagnosticos", headers=h, json={"diagnostico_id": did_sana})
    assert r3.status_code == 201
    assert r3.json()["severidad"] == 0

    # Parcela o diagnóstico ajeno / no encontrado -> 404
    h_otro = usuario(cliente, "otro_ag@x.pe")
    pid_otro = cliente.post("/api/parcelas", headers=h_otro, json={"nombre": "Ajena", "cultivo": "tomate"}).json()["id"]
    assert cliente.post(f"/api/parcelas/{pid_otro}/diagnosticos", headers=h, json={"diagnostico_id": did}).status_code == 404
    assert cliente.post(f"/api/parcelas/{pid}/diagnosticos", headers=h_otro, json={"diagnostico_id": did}).status_code == 404
    assert cliente.post("/api/parcelas/999999/diagnosticos", headers=h, json={"diagnostico_id": did}).status_code == 404
    assert cliente.post(f"/api/parcelas/{pid}/diagnosticos", headers=h, json={"diagnostico_id": 999999}).status_code == 404


def test_duplicado_409(cliente):
    h = usuario(cliente, "dup@x.pe")
    pid1 = cliente.post("/api/parcelas", headers=h, json={"nombre": "Lote A", "cultivo": "tomate"}).json()["id"]
    pid2 = cliente.post("/api/parcelas", headers=h, json={"nombre": "Lote B", "cultivo": "tomate"}).json()["id"]
    did = diagnosticar(cliente, h)

    assert cliente.post(f"/api/parcelas/{pid1}/diagnosticos", headers=h, json={"diagnostico_id": did}).status_code == 201
    # Ya está en esa misma parcela -> 409
    assert cliente.post(f"/api/parcelas/{pid1}/diagnosticos", headers=h, json={"diagnostico_id": did}).status_code == 409
    # Ya está en otra parcela -> 409
    assert cliente.post(f"/api/parcelas/{pid2}/diagnosticos", headers=h, json={"diagnostico_id": did}).status_code == 409


def test_quitar_diagnostico_parcela(cliente):
    h = usuario(cliente, "quitar@x.pe")
    pid = cliente.post("/api/parcelas", headers=h, json={"nombre": "Huerto", "cultivo": "tomate"}).json()["id"]
    did1 = diagnosticar(cliente, h)

    # Caso 1: visita creada para el diagnóstico (sin tratamiento del agricultor) -> se borra la visita
    cliente.post(f"/api/parcelas/{pid}/diagnosticos", headers=h, json={"diagnostico_id": did1, "nota": "Foto inicial"})
    r_del = cliente.delete(f"/api/parcelas/{pid}/diagnosticos/{did1}", headers=h)
    assert r_del.status_code == 204
    detalle = cliente.get(f"/api/parcelas/{pid}", headers=h).json()
    assert detalle["visitas"] == 0
    assert len(detalle["historial"]) == 0

    # Caso 2: visita con datos del agricultor (tratamiento aplicado) -> se conserva la visita con diagnostico_id NULL
    did2 = diagnosticar(cliente, h)
    v_agri = cliente.post(
        f"/api/parcelas/{pid}/visitas",
        headers=h,
        json={"diagnostico_id": did2, "severidad": 2, "tratamiento": "Fungicida cúprico"},
    ).json()
    assert v_agri["diagnostico_id"] == did2
    r_del2 = cliente.delete(f"/api/parcelas/{pid}/diagnosticos/{did2}", headers=h)
    assert r_del2.status_code == 204
    detalle2 = cliente.get(f"/api/parcelas/{pid}", headers=h).json()
    assert detalle2["visitas"] == 1
    v_actual = detalle2["historial"][0]
    assert v_actual["diagnostico_id"] is None
    assert v_actual["tratamiento"] == "Fungicida cúprico"
    assert v_actual["clase"] is None

    # Validaciones de error 404
    # Diagnóstico no presente en la parcela -> 404
    assert cliente.delete(f"/api/parcelas/{pid}/diagnosticos/{did1}", headers=h).status_code == 404

    # Diagnóstico o parcela ajenos -> 404
    h_otro = usuario(cliente, "quitar_otro@x.pe")
    pid_otro = cliente.post("/api/parcelas", headers=h_otro, json={"nombre": "Otro Huerto", "cultivo": "tomate"}).json()["id"]
    did_otro = diagnosticar(cliente, h_otro)
    cliente.post(f"/api/parcelas/{pid_otro}/diagnosticos", headers=h_otro, json={"diagnostico_id": did_otro})
    assert cliente.delete(f"/api/parcelas/{pid_otro}/diagnosticos/{did_otro}", headers=h).status_code == 404
    assert cliente.delete(f"/api/parcelas/{pid}/diagnosticos/{did_otro}", headers=h).status_code == 404
    assert cliente.delete(f"/api/parcelas/{pid_otro}/diagnosticos/{did2}", headers=h_otro).status_code == 404


def test_historial_con_parcela(cliente):
    h = usuario(cliente, "hist@x.pe")
    pid = cliente.post("/api/parcelas", headers=h, json={"nombre": "Parcela El Molino", "cultivo": "tomate"}).json()["id"]
    did_con = diagnosticar(cliente, h)
    did_sin = diagnosticar(cliente, h)

    # Asociar solo did_con a la parcela
    cliente.post(f"/api/parcelas/{pid}/diagnosticos", headers=h, json={"diagnostico_id": did_con})

    # GET /api/historial sin filtro: ambos están presentes, con y sin parcela
    r_todo = cliente.get("/api/historial", headers=h)
    assert r_todo.status_code == 200
    items_map = {it["id"]: it for it in r_todo.json()["items"]}
    assert items_map[did_con]["parcela_id"] == pid
    assert items_map[did_con]["parcela_nombre"] == "Parcela El Molino"
    assert items_map[did_sin]["parcela_id"] is None
    assert items_map[did_sin]["parcela_nombre"] is None

    # GET /api/historial?sin_parcela=true: solo did_sin
    r_sin = cliente.get("/api/historial?sin_parcela=true", headers=h)
    assert r_sin.status_code == 200
    ids_sin = [it["id"] for it in r_sin.json()["items"]]
    assert did_con not in ids_sin
    assert did_sin in ids_sin
