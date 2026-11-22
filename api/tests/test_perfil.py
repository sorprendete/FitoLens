"""Pruebas del perfil propio del usuario y cambio de contraseÃ±a."""
from sqlalchemy import select

from app.db.modelos import Auditoria, Usuario
from app.db.sesion import fabrica
from app.seguridad.claves import crear_token
from tests.conftest import token


def registrar(cliente, email="perfil@x.pe", nombre="Perfil Inicial", clave="clave12345"):
    r = cliente.post("/api/auth/registro", json={"email": email, "nombre": nombre, "password": clave})
    assert r.status_code == 201
    return r.json()["usuario"]["id"], {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_yo_incluye_tiene_clave(cliente):
    _, auth = registrar(cliente, "yo@x.pe")
    res = cliente.get("/api/auth/yo", headers=auth)
    assert res.status_code == 200
    datos = res.json()
    assert datos["email"] == "yo@x.pe"
    assert datos["tiene_clave"] is True


def test_actualizar_nombre_exito(cliente):
    _, auth = registrar(cliente, "nombre@x.pe", "Nombre Viejo")
    res = cliente.patch("/api/auth/yo", json={"nombre": "Nombre Actualizado"}, headers=auth)
    assert res.status_code == 200
    assert res.json()["nombre"] == "Nombre Actualizado"

    yo = cliente.get("/api/auth/yo", headers=auth).json()
    assert yo["nombre"] == "Nombre Actualizado"

    with fabrica()() as s:
        audit = s.scalar(
            select(Auditoria).where(Auditoria.accion == "perfil", Auditoria.email == "nombre@x.pe")
        )
        assert audit is not None
        assert audit.estado == "exito"


def test_actualizar_nombre_validacion(cliente):
    _, auth = registrar(cliente, "valida@x.pe")
    assert cliente.patch("/api/auth/yo", json={"nombre": "A"}, headers=auth).status_code == 422
    assert cliente.patch("/api/auth/yo", json={"nombre": "   "}, headers=auth).status_code == 422
    assert cliente.patch("/api/auth/yo", json={"nombre": "X" * 121}, headers=auth).status_code == 422
    assert cliente.patch("/api/auth/yo", json={"nombre": "Sin Token"}).status_code == 401


def test_cambiar_clave_exito(cliente):
    _, auth = registrar(cliente, "clave@x.pe", clave="clave-vieja-1")
    res = cliente.post(
        "/api/auth/cambiar-clave",
        json={"actual": "clave-vieja-1", "nueva": "clave-nueva-segura"},
        headers=auth,
    )
    assert res.status_code == 200
    assert res.json().get("ok") is True

    # El login con clave vieja falla
    assert cliente.post("/api/auth/login", json={"email": "clave@x.pe", "password": "clave-vieja-1"}).status_code == 401
    # El login con clave nueva funciona
    assert cliente.post("/api/auth/login", json={"email": "clave@x.pe", "password": "clave-nueva-segura"}).status_code == 200

    with fabrica()() as s:
        audit = s.scalar(
            select(Auditoria).where(Auditoria.accion == "cambio_clave", Auditoria.email == "clave@x.pe", Auditoria.estado == "exito")
        )
        assert audit is not None


def test_cambiar_clave_actual_incorrecta(cliente):
    _, auth = registrar(cliente, "erronea@x.pe", clave="clave-correcta")
    res = cliente.post(
        "/api/auth/cambiar-clave",
        json={"actual": "clave-equivocada", "nueva": "nueva-clave-123"},
        headers=auth,
    )
    assert res.status_code == 400
    assert "correcta" in res.json()["detail"].lower()

    with fabrica()() as s:
        audit = s.scalar(
            select(Auditoria).where(Auditoria.accion == "cambio_clave", Auditoria.email == "erronea@x.pe", Auditoria.estado == "fallo")
        )
        assert audit is not None


def test_cambiar_clave_fuerza_bruta(cliente):
    _, auth = registrar(cliente, "fuerza@x.pe", clave="clave-original")
    for _ in range(5):
        assert cliente.post(
            "/api/auth/cambiar-clave",
            json={"actual": "mala", "nueva": "nueva-clave-123"},
            headers=auth,
        ).status_code == 400

    # Al 6to intento queda bloqueado con 429
    r_bloqueo = cliente.post(
        "/api/auth/cambiar-clave",
        json={"actual": "mala", "nueva": "nueva-clave-123"},
        headers=auth,
    )
    assert r_bloqueo.status_code == 429

    with fabrica()() as s:
        audit = s.scalar(
            select(Auditoria).where(Auditoria.accion == "cambio_clave", Auditoria.email == "fuerza@x.pe", Auditoria.estado == "bloqueado")
        )
        assert audit is not None


def test_cambiar_clave_validacion_tamano(cliente):
    _, auth = registrar(cliente, "tamano@x.pe", clave="clave-original")
    # Menos de 8 caracteres / bytes
    assert cliente.post(
        "/api/auth/cambiar-clave",
        json={"actual": "clave-original", "nueva": "1234567"},
        headers=auth,
    ).status_code == 422

    # MÃ¡s de 72 bytes
    assert cliente.post(
        "/api/auth/cambiar-clave",
        json={"actual": "clave-original", "nueva": "a" * 73},
        headers=auth,
    ).status_code == 422


def test_cuenta_google_sin_clave(cliente):
    # Simular usuario registrado vÃ­a Google sin contraseÃ±a previa
    with fabrica()() as s:
        u = Usuario(
            email="googleuser@x.pe",
            nombre="Usuario Google",
            password_hash="!google$hashficticio",
            rol="usuario",
        )
        s.add(u)
        s.commit()
        s.refresh(u)
        u_id = u.id

    t = crear_token(u_id, "usuario")
    auth_google = {"Authorization": f"Bearer {t}"}

    # GET /yo debe indicar tiene_clave = False
    yo = cliente.get("/api/auth/yo", headers=auth_google).json()
    assert yo["tiene_clave"] is False

    # Puede asignar contraseÃ±a sin enviar 'actual'
    res = cliente.post(
        "/api/auth/cambiar-clave",
        json={"nueva": "primera-clave-creada"},
        headers=auth_google,
    )
    assert res.status_code == 200

    # Ahora GET /yo debe indicar tiene_clave = True
    yo_despues = cliente.get("/api/auth/yo", headers=auth_google).json()
    assert yo_despues["tiene_clave"] is True

    # Puede iniciar sesiÃ³n con la nueva clave
    res_login = cliente.post(
        "/api/auth/login",
        json={"email": "googleuser@x.pe", "password": "primera-clave-creada"},
    )
    assert res_login.status_code == 200
