"""Dependencias compartidas: usuario actual (JWT), admin y modelos cargados."""
import logging

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.seguridad.claves import leer_token
from app.db.modelos import Dispositivo, Usuario, ahora
from app.db.sesion import db
from app.ia.registro import Registro

_bearer = HTTPBearer(auto_error=False)
log = logging.getLogger("fitolens.acceso")


def usuario_opcional(cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
                     sesion: Session = Depends(db)) -> Usuario | None:
    if cred is None:
        return None
    datos = leer_token(cred.credentials)
    usuario = sesion.get(Usuario, int(datos["sub"])) if datos else None
    if usuario is None or not usuario.activo:
        raise HTTPException(401, "Sesión inválida o vencida.")
    if datos.get("dis"):  # token de la app: el dispositivo tiene que seguir vinculado
        d = sesion.get(Dispositivo, int(datos["dis"]))
        if d is None or d.revocado or d.usuario_id != usuario.id:
            raise HTTPException(401, "Este teléfono ya no está vinculado. Vuelve a iniciar sesión.")
        d.ultimo_uso = ahora()
    return usuario


def usuario_requerido(usuario: Usuario | None = Depends(usuario_opcional)) -> Usuario:
    if usuario is None:
        raise HTTPException(401, "Inicia sesión.")
    return usuario


def admin_requerido(request: Request, usuario: Usuario = Depends(usuario_requerido)) -> Usuario:
    # El rol se lee de la base de datos en cada petición, no del token: quitarlo surte efecto al instante.
    if usuario.rol != "admin":
        log.warning("Acceso denegado a %s: usuario=%s", request.url.path, usuario.id)
        raise HTTPException(403, "Solo el administrador puede ver esta sección.")
    return usuario


def registro_modelos(request: Request) -> Registro:
    return request.app.state.registro
