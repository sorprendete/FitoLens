"""Límite de peticiones por IP (ventana deslizante de 60 s, en memoria de cada proceso)."""
import time
from collections import defaultdict, deque
from threading import Lock


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
