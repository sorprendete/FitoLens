"""Contraseñas (bcrypt) y tokens JWT."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import ajustes

ALGORITMO = "HS256"


def hashear(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verificar(password: str, hash_: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hash_.encode())
    except ValueError:
        return False


def crear_token(usuario_id: int, rol: str) -> str:
    expira = datetime.now(timezone.utc) + timedelta(minutes=ajustes().jwt_minutos)
    datos = {"sub": str(usuario_id), "rol": rol, "exp": expira}
    return jwt.encode(datos, ajustes().jwt_secreto, algorithm=ALGORITMO)


def leer_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, ajustes().jwt_secreto, algorithms=[ALGORITMO])
    except jwt.PyJWTError:
        return None
