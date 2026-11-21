"""Contraseñas (bcrypt) y tokens JWT."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import ajustes

ALGORITMO = "HS256"
MAX_PASSWORD_BYTES = 72


def hashear(password: str) -> str:
    raw = password.encode()
    if len(raw) > MAX_PASSWORD_BYTES:
        raise ValueError(f"La contraseña no puede superar los {MAX_PASSWORD_BYTES} bytes.")
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode()


def verificar(password: str, hash_: str) -> bool:
    try:
        raw = password.encode()
        if len(raw) > MAX_PASSWORD_BYTES:
            return False
        return bcrypt.checkpw(raw, hash_.encode())
    except ValueError:
        return False


def crear_token(usuario_id: int, rol: str, dispositivo_id: int | None = None) -> str:
    """Sin dispositivo: sesión de la web (jwt_minutos). Con dispositivo: sesión de la app (jwt_dias_dispositivo)."""
    a = ajustes()
    duracion = timedelta(days=a.jwt_dias_dispositivo) if dispositivo_id else timedelta(minutes=a.jwt_minutos)
    datos = {"sub": str(usuario_id), "rol": rol, "exp": datetime.now(timezone.utc) + duracion}
    if dispositivo_id:
        datos["dis"] = dispositivo_id
    return jwt.encode(datos, ajustes().jwt_secreto, algorithm=ALGORITMO)


def leer_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, ajustes().jwt_secreto, algorithms=[ALGORITMO])
    except jwt.PyJWTError:
        return None
