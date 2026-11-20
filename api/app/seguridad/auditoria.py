"""Escribe eventos en la tabla auditoria (y en el log). Lo usan login, registro, diagnóstico y admin."""
import logging

from fastapi import Request
from sqlalchemy.orm import Session

from app.db.modelos import Auditoria

log = logging.getLogger("fitolens.auditoria")


def ip_cliente(request: Request) -> str:
    # Caddy pone la IP real del cliente en X-Forwarded-For. Se toma la última entrada:
    # las anteriores las puede escribir el propio cliente para falsificarla.
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[-1].strip()[:64]
    return request.client.host if request.client else "desconocida"


def registrar(sesion: Session, request: Request, accion: str, estado: str, *,
              usuario_id: int | None = None, email: str | None = None, detalle: str | None = None) -> None:
    fila = Auditoria(
        accion=accion, estado=estado, usuario_id=usuario_id,
        email=(email or "").lower()[:254] or None, ip=ip_cliente(request),
        agente=request.headers.get("user-agent", "")[:300], detalle=(detalle or "")[:500] or None,
    )
    log.info("%s %s email=%s ip=%s %s", accion, estado, fila.email, fila.ip, fila.detalle or "")
    sesion.add(fila)
    sesion.commit()
