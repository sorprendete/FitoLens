"""Contraseñas (bcrypt), tokens JWT y límite de peticiones por IP."""
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from threading import Lock

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


class LimitadorPorIP:
    """Ventana deslizante de 60 s en memoria. Suficiente para un solo contenedor de API."""

    def __init__(self) -> None:
        self._eventos: dict[str, deque] = defaultdict(deque)
        self._lock = Lock()

    def permitir(self, ip: str, limite: int) -> bool:
        ahora = time.monotonic()
        with self._lock:
            cola = self._eventos[ip]
            while cola and ahora - cola[0] > 60:
                cola.popleft()
            if len(cola) >= limite:
                return False
            cola.append(ahora)
            return True


limitador = LimitadorPorIP()
