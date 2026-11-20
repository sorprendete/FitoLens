"""Dependencias compartidas: usuario actual (JWT), admin y modelos cargados."""
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.seguridad import leer_token
from app.db.modelos import Usuario
from app.db.sesion import db
from app.ia.registro import Registro

_bearer = HTTPBearer(auto_error=False)


def usuario_opcional(cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
                     sesion: Session = Depends(db)) -> Usuario | None:
    if cred is None:
        return None
    datos = leer_token(cred.credentials)
    usuario = sesion.get(Usuario, int(datos["sub"])) if datos else None
    if usuario is None or not usuario.activo:
        raise HTTPException(401, "Sesión inválida o vencida.")
    return usuario


def usuario_requerido(usuario: Usuario | None = Depends(usuario_opcional)) -> Usuario:
    if usuario is None:
        raise HTTPException(401, "Inicia sesión.")
    return usuario


def registro_modelos(request: Request) -> Registro:
    return request.app.state.registro


def ip_cliente(request: Request) -> str:
    # Caddy agrega X-Forwarded-For; la API solo es accesible a través de Caddy.
    reenviada = request.headers.get("x-forwarded-for", "")
    return reenviada.split(",")[0].strip() or (request.client.host if request.client else "?")
