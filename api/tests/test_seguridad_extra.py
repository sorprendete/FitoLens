import jwt
import pytest
from tests.conftest import foto, token


def test_cabeceras_de_seguridad_presentes(cliente):
    r = cliente.get("/api/salud")
    assert r.status_code == 200
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert r.headers.get("x-frame-options") == "DENY"
    assert r.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert r.headers.get("x-xss-protection") == "1; mode=block"


def test_token_sub_malformado_o_no_numerico(cliente):
    # Token válido criptográficamente pero con sub no numérico
    secreto = "secreto-de-pruebas-0123456789abcdef"
    token_malo = jwt.encode({"sub": "no-es-un-id", "rol": "usuario", "exp": 9999999999}, secreto, algorithm="HS256")
    r = cliente.get("/api/auth/yo", headers={"Authorization": f"Bearer {token_malo}"})
    assert r.status_code == 401
    assert "Sesión inválida o vencida" in r.json()["detail"]


def test_token_sub_ausente(cliente):
    secreto = "secreto-de-pruebas-0123456789abcdef"
    token_sin_sub = jwt.encode({"rol": "usuario", "exp": 9999999999}, secreto, algorithm="HS256")
    r = cliente.get("/api/auth/yo", headers={"Authorization": f"Bearer {token_sin_sub}"})
    assert r.status_code == 401
    assert "Sesión inválida o vencida" in r.json()["detail"]


def test_token_dispositivo_malformado(cliente):
    secreto = "secreto-de-pruebas-0123456789abcdef"
    token_dis_malo = jwt.encode({"sub": "1", "rol": "usuario", "dis": "abc", "exp": 9999999999}, secreto, algorithm="HS256")
    r = cliente.get("/api/auth/yo", headers={"Authorization": f"Bearer {token_dis_malo}"})
    assert r.status_code == 401


def test_longitud_maxima_password_registro(cliente):
    # Más de 72 bytes debe ser rechazado por validación (límite bcrypt)
    password_larga = "A" * 73
    r = cliente.post("/api/auth/registro", json={
        "email": "larga@fitolens.pe",
        "nombre": "Prueba",
        "password": password_larga,
    })
    assert r.status_code == 422


def test_longitud_maxima_password_login(cliente):
    password_larga = "A" * 73
    r = cliente.post("/api/auth/login", json={
        "email": "larga@fitolens.pe",
        "password": password_larga,
    })
    assert r.status_code == 422


def test_limite_tasa_registro_por_ip(cliente):
    # Se permiten hasta 10 registros por minuto por IP; el 11 debe ser bloqueado con 429
    ip_test = "10.0.0.99"
    for i in range(10):
        r = cliente.post("/api/auth/registro", json={
            "email": f"reg_{i}@fitolens.pe",
            "nombre": f"Usuario {i}",
            "password": "Password123",
        }, headers={"X-Forwarded-For": ip_test})
        assert r.status_code == 201
    r_bloqueado = cliente.post("/api/auth/registro", json={
        "email": "reg_bloqueado@fitolens.pe",
        "nombre": "Usuario Bloqueado",
        "password": "Password123",
    }, headers={"X-Forwarded-For": ip_test})
    assert r_bloqueado.status_code == 429
    assert "Demasiados intentos de registro" in r_bloqueado.json()["detail"]


def test_salud_errores_sanitizados(cliente, tmp_path):
    from app.ia.registro import cargar
    # Cargar con modelo alterado genera error en registro
    (tmp_path / "hortalizas").mkdir(exist_ok=True)
    (tmp_path / "hortalizas" / "manifest.json").write_text('{"nombre":"hortalizas","tipo":"router","clases":[]}')
    (tmp_path / "hortalizas" / "model.onnx").write_bytes(b"invalido")
    cliente.app.state.registro = cargar(tmp_path, 1)

    r = cliente.get("/api/salud")
    data = r.json()
    assert "errores_modelos" in data
    # Verificar que no se fugan rutas absolutas del sistema de archivos
    for k, v in data["errores_modelos"].items():
        assert "/" not in v
        assert "\\" not in v
        assert "C:" not in v
        assert "Error de inicialización" == v
