"""Pruebas del inicio de sesión con Google (POST /api/auth/google)."""
from app.db.modelos import Usuario
from sqlalchemy import select

CLIENT_ID_WEB = "57119843943-eri36uvtp35t2b0nuh6kqvoqt25fc6sp.apps.googleusercontent.com"


def test_token_valido_crea_usuario(cliente, monkeypatch):
    datos_simulados = {
        "email": "nuevo_agricultor@fitolens.pe",
        "name": "Agricultor Nuevo",
        "aud": CLIENT_ID_WEB,
        "iss": "https://accounts.google.com",
        "email_verified": True,
    }
    monkeypatch.setattr("app.rutas.auth.verificar_token_google", lambda token: datos_simulados)

    r = cliente.post("/api/auth/google", json={"id_token": "token-falso-valido"})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert "access_token" in cuerpo
    assert cuerpo["usuario"]["email"] == "nuevo_agricultor@fitolens.pe"
    assert cuerpo["usuario"]["nombre"] == "Agricultor Nuevo"


def test_segundo_login_vincula_usuario_existente(cliente, monkeypatch):
    datos_simulados = {
        "email": "agricultor_recurrente@fitolens.pe",
        "name": "Agricultor Recurrente",
        "aud": CLIENT_ID_WEB,
        "iss": "https://accounts.google.com",
        "email_verified": True,
    }
    monkeypatch.setattr("app.rutas.auth.verificar_token_google", lambda token: datos_simulados)

    # Primer login crea el usuario
    r1 = cliente.post("/api/auth/google", json={"id_token": "token-1"})
    assert r1.status_code == 200
    id_usuario = r1.json()["usuario"]["id"]

    # Segundo login vincula (retorna el mismo usuario sin duplicar)
    r2 = cliente.post("/api/auth/google", json={"id_token": "token-2"})
    assert r2.status_code == 200
    assert r2.json()["usuario"]["id"] == id_usuario
    assert r2.json()["usuario"]["email"] == "agricultor_recurrente@fitolens.pe"


def test_aud_invalida_401(cliente, monkeypatch):
    datos_aud_erronea = {
        "email": "alguien@fitolens.pe",
        "name": "Alguien",
        "aud": "cliente-google-desconocido.apps.googleusercontent.com",
        "iss": "https://accounts.google.com",
        "email_verified": True,
    }
    monkeypatch.setattr("app.rutas.auth.verificar_token_google", lambda token: datos_aud_erronea)

    r = cliente.post("/api/auth/google", json={"id_token": "token-aud-invalida"})
    assert r.status_code == 401
    assert "Audiencia" in r.text or "inválid" in r.text.lower()


def test_email_no_verificado_401(cliente, monkeypatch):
    datos_no_verificado = {
        "email": "no_verificado@fitolens.pe",
        "name": "Sin Verificar",
        "aud": CLIENT_ID_WEB,
        "iss": "https://accounts.google.com",
        "email_verified": False,
    }
    monkeypatch.setattr("app.rutas.auth.verificar_token_google", lambda token: datos_no_verificado)

    r = cliente.post("/api/auth/google", json={"id_token": "token-no-verificado"})
    assert r.status_code == 401
    assert "verificado" in r.text.lower()
