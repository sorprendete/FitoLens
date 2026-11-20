from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import ajustes
from app.core.seguridad import crear_token, hashear, verificar
from app.db.modelos import Usuario
from app.db.sesion import db
from app.esquemas import Login, Registro, Token, UsuarioSalida
from app.rutas.dependencias import usuario_requerido

router = APIRouter(prefix="/auth", tags=["auth"])


def _token(u: Usuario) -> Token:
    return Token(access_token=crear_token(u.id, u.rol), usuario=UsuarioSalida.model_validate(u))


@router.post("/login", response_model=Token)
def login(datos: Login, sesion: Session = Depends(db)):
    u = sesion.scalar(select(Usuario).where(Usuario.email == datos.email.lower()))
    if u is None or not u.activo or not verificar(datos.password, u.password_hash):
        raise HTTPException(401, "Correo o contraseña incorrectos.")
    return _token(u)


@router.post("/registro", response_model=Token, status_code=201)
def registro(datos: Registro, sesion: Session = Depends(db)):
    if not ajustes().registro_abierto:
        raise HTTPException(403, "El registro está cerrado.")
    email = datos.email.lower()
    if sesion.scalar(select(Usuario).where(Usuario.email == email)):
        raise HTTPException(409, "Ese correo ya tiene cuenta.")
    u = Usuario(email=email, nombre=datos.nombre, password_hash=hashear(datos.password))
    sesion.add(u)
    sesion.commit()
    return _token(u)


@router.get("/yo", response_model=UsuarioSalida)
def yo(usuario: Usuario = Depends(usuario_requerido)):
    return usuario


def asegurar_admin(sesion: Session) -> None:
    """Crea el admin de ADMIN_USUARIO/ADMIN_CLAVE si todavía no existe (se llama al arrancar)."""
    a = ajustes()
    if not (a.admin_usuario and a.admin_clave):
        return
    email = a.admin_usuario.lower()
    if sesion.scalar(select(Usuario).where(Usuario.email == email)) is None:
        sesion.add(Usuario(email=email, nombre="Administrador", rol="admin",
                           password_hash=hashear(a.admin_clave)))
        try:
            sesion.commit()
        except IntegrityError:  # otro worker lo creó al mismo tiempo
            sesion.rollback()
