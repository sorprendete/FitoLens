"""Entorno de pruebas: SQLite temporal y modelos ONNX falsos (sin Postgres ni modelos reales)."""
import io
import os
import sys
from pathlib import Path

import pytest
from PIL import Image

RAIZ = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(RAIZ), str(RAIZ / "scripts")]


@pytest.fixture(scope="session")
def dir_modelos(tmp_path_factory):
    import crear_modelos_falsos
    d = tmp_path_factory.mktemp("modelos")
    crear_modelos_falsos.crear_todos(d)
    return d


@pytest.fixture
def cliente(tmp_path, dir_modelos, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("JWT_SECRETO", "secreto-de-pruebas-0123456789abcdef")
    monkeypatch.setenv("MODELOS_DIR", str(dir_modelos))
    monkeypatch.setenv("ADMIN_USUARIO", "admin@fitolens.pe")
    monkeypatch.setenv("ADMIN_CLAVE", "clave-admin-123")
    monkeypatch.setenv("REGISTRO_ABIERTO", "true")
    monkeypatch.setenv("LIMITE_DIAGNOSTICOS_MINUTO", "1000")
    from app.core.config import ajustes
    from app.db import sesion
    from app.db.modelos import Base
    ajustes.cache_clear()
    sesion.fabrica.cache_clear()
    Base.metadata.create_all(sesion.fabrica()().get_bind())

    from fastapi.testclient import TestClient
    from app.main import crear_app
    with TestClient(crear_app()) as c:
        yield c


def foto(ancho=120, alto=90, formato="JPEG", color=(40, 140, 50)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (ancho, alto), color).save(buf, format=formato)
    return buf.getvalue()


def token(cliente, email="admin@fitolens.pe", password="clave-admin-123") -> dict:
    r = cliente.post("/api/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
