import secrets

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import ajustes
from app.db.modelos import Usuario, ahora
from app.db.sesion import db
from app.esquemas import Login, LoginGoogle, Registro, Token, UsuarioSalida
from app.rutas.dependencias import usuario_requerido
from app.seguridad import auditoria
from app.seguridad.claves import crear_token, hashear, verificar
from app.seguridad.fuerza_bruta import esta_bloqueado
from app.seguridad.limites import limitador

router = APIRouter(prefix="/auth", tags=["auth"])

_jwks_cliente = PyJWKClient("https://www.googleapis.com/oauth2/v3/certs")


def validar_datos_google(datos: dict) -> None:
    cids = [c.strip() for c in ajustes().google_client_ids.split(",") if c.strip()]
    aud = datos.get("aud")
    aud_valida = (aud in cids) if isinstance(aud, str) else any(a in cids for a in aud) if isinstance(aud, list) else False
    if not aud_valida:
        raise HTTPException(401, "Audiencia del token de Google no válida.")
    emisor = datos.get("iss")
    if emisor not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "Emisor de Google no válido.")
    if not datos.get("email_verified"):
        raise HTTPException(401, "El correo de Google no está verificado.")


def verificar_token_google(id_token: str) -> dict:
    """Verifica el id_token emitido por Google con sus claves públicas y PyJWT."""
    try:
        clave_firma = _jwks_cliente.get_signing_key_from_jwt(id_token)
        cids = [c.strip() for c in ajustes().google_client_ids.split(",") if c.strip()]
        datos = jwt.decode(
            id_token,
            clave_firma.key,
            algorithms=["RS256"],
            audience=cids,
            options={"verify_exp": True},
        )
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Token de Google inválido: {e}") from e
    except Exception as e:
        raise HTTPException(401, f"No se pudo verificar el token de Google: {e}") from e

    validar_datos_google(datos)
    return datos


def _token(u: Usuario) -> Token:
    return Token(access_token=crear_token(u.id, u.rol), usuario=UsuarioSalida.model_validate(u))


@router.post("/login", response_model=Token)
def login(datos: Login, request: Request, sesion: Session = Depends(db)):
    return _token(autenticar(datos, request, sesion))


@router.post("/google", response_model=Token)
def login_google(datos: LoginGoogle, request: Request, sesion: Session = Depends(db)):
    ip = auditoria.ip_cliente(request)
    if esta_bloqueado(sesion, "", ip):
        auditoria.registrar(sesion, request, "login", "bloqueado",
                            detalle="Demasiados intentos fallidos por IP.")
        minutos = ajustes().login_bloqueo_minutos
        raise HTTPException(429, f"Demasiados intentos fallidos. Espera {minutos} minutos.")

    try:
        payload = verificar_token_google(datos.id_token)
        validar_datos_google(payload)
    except HTTPException as e:
        auditoria.registrar(sesion, request, "login", "fallo", detalle=str(e.detail))
        raise

    email = (payload.get("email") or "").lower().strip()
    if not email:
        auditoria.registrar(sesion, request, "login", "fallo", detalle="Token de Google sin correo.")
        raise HTTPException(401, "El token de Google no contiene un correo válido.")

    if esta_bloqueado(sesion, email, ip):
        auditoria.registrar(sesion, request, "login", "bloqueado", email=email,
                            detalle="Demasiados intentos fallidos.")
        minutos = ajustes().login_bloqueo_minutos
        raise HTTPException(429, f"Demasiados intentos fallidos. Espera {minutos} minutos.")

    u = sesion.scalar(select(Usuario).where(Usuario.email == email))
    if u is None:
        nombre = (payload.get("name") or payload.get("given_name") or email.split("@")[0]).strip()[:120] or "Usuario"
        u = Usuario(
            email=email,
            nombre=nombre,
            password_hash=hashear(secrets.token_urlsafe(32)),
            ultimo_acceso=ahora(),
        )
        sesion.add(u)
        sesion.commit()
        sesion.refresh(u)
    else:
        if not u.activo:
            auditoria.registrar(sesion, request, "login", "fallo", usuario_id=u.id, email=email,
                                detalle="Cuenta desactivada.")
            raise HTTPException(403, "Tu cuenta está desactivada. Habla con el administrador.")
        u.ultimo_acceso = ahora()
        sesion.commit()

    auditoria.registrar(sesion, request, "login", "exito", usuario_id=u.id, email=email, detalle="Google")
    return _token(u)


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
