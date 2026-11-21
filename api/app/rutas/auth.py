from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import ajustes
from app.db.modelos import Usuario, ahora
from app.db.sesion import db
from app.esquemas import Login, Registro, Token, UsuarioSalida
from app.rutas.dependencias import usuario_requerido
from app.seguridad import auditoria
from app.seguridad.claves import crear_token, hashear, verificar
from app.seguridad.fuerza_bruta import esta_bloqueado
from app.seguridad.limites import limitador

router = APIRouter(prefix="/auth", tags=["auth"])


def _token(u: Usuario) -> Token:
    return Token(access_token=crear_token(u.id, u.rol), usuario=UsuarioSalida.model_validate(u))


@router.post("/login", response_model=Token)
def login(datos: Login, request: Request, sesion: Session = Depends(db)):
    return _token(autenticar(datos, request, sesion))


def autenticar(datos: Login, request: Request, sesion: Session, detalle: str | None = None) -> Usuario:
    """Revisa correo y contraseña con la protección contra fuerza bruta. La usan la web y la app."""
    email = datos.email.lower()
    if esta_bloqueado(sesion, email, auditoria.ip_cliente(request)):
        auditoria.registrar(sesion, request, "login", "bloqueado", email=email,
                            detalle="Demasiados intentos fallidos.")
        minutos = ajustes().login_bloqueo_minutos
        raise HTTPException(429, f"Demasiados intentos fallidos. Espera {minutos} minutos.")

    u = sesion.scalar(select(Usuario).where(Usuario.email == email))
    if u is None or not verificar(datos.password, u.password_hash):
        auditoria.registrar(sesion, request, "login", "fallo", email=email, detalle="Contraseña incorrecta.")
        raise HTTPException(401, "Correo o contraseña incorrectos.")
    if not u.activo:
        auditoria.registrar(sesion, request, "login", "fallo", usuario_id=u.id, email=email,
                            detalle="Cuenta desactivada.")
        raise HTTPException(403, "Tu cuenta está desactivada. Habla con el administrador.")

    u.ultimo_acceso = ahora()
    auditoria.registrar(sesion, request, "login", "exito", usuario_id=u.id, email=email, detalle=detalle)
    return u


@router.post("/registro", response_model=Token, status_code=201)
def registro(datos: Registro, request: Request, sesion: Session = Depends(db)):
    ip = auditoria.ip_cliente(request)
    if not limitador.permitir(f"registro:{ip}", 10):
        auditoria.registrar(sesion, request, "registro", "bloqueado",
                            detalle="Demasiados intentos de registro.")
        raise HTTPException(429, "Demasiados intentos de registro. Espera un minuto.")
    if not ajustes().registro_abierto:
        raise HTTPException(403, "El registro está cerrado.")
    email = datos.email.lower()
    if sesion.scalar(select(Usuario).where(Usuario.email == email)):
        auditoria.registrar(sesion, request, "registro", "fallo", email=email, detalle="Correo ya registrado.")
        raise HTTPException(409, "Ese correo ya tiene cuenta.")
    u = Usuario(email=email, nombre=datos.nombre, password_hash=hashear(datos.password), ultimo_acceso=ahora())
    sesion.add(u)
    sesion.flush()
    auditoria.registrar(sesion, request, "registro", "exito", usuario_id=u.id, email=email)
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
        except IntegrityError:  # otro proceso lo creó al mismo tiempo
            sesion.rollback()
