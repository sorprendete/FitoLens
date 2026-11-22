"""Bloqueo de inicio de sesión tras varios fallos, por correo y por IP.

Se cuenta en la tabla auditoria, así funciona igual con varios procesos y sobrevive a reinicios.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import ajustes
from app.db.modelos import Auditoria


def _fallos(sesion: Session, condicion, desde: datetime) -> int:
    return sesion.scalar(
        select(func.count()).select_from(Auditoria).where(
            Auditoria.accion.in_(("login", "cambio_clave")), Auditoria.estado == "fallo", Auditoria.fecha >= desde, condicion)
    )


def esta_bloqueado(sesion: Session, email: str, ip: str) -> bool:
    a = ajustes()
    desde = datetime.now(timezone.utc) - timedelta(minutes=a.login_bloqueo_minutos)
    return (_fallos(sesion, Auditoria.email == email.lower(), desde) >= a.login_max_fallos
            or _fallos(sesion, Auditoria.ip == ip, desde) >= a.login_max_fallos_ip)
