"""Vincular la app del teléfono a una cuenta. Cada teléfono tiene su propia sesión larga, que se puede revocar."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.modelos import Dispositivo, Usuario, ahora
from app.db.sesion import db
from app.esquemas import DispositivoSalida, TokenDispositivo, UsuarioSalida, Vincular
from app.rutas.auth import autenticar
from app.rutas.dependencias import usuario_requerido
from app.seguridad import auditoria
from app.seguridad.claves import crear_token

router = APIRouter(prefix="/dispositivos", tags=["dispositivos"])


@router.post("", response_model=TokenDispositivo, status_code=201)
def vincular(datos: Vincular, request: Request, sesion: Session = Depends(db)):
    """La app inicia sesión aquí (no en /auth/login) para recibir un token de jwt_dias_dispositivo días."""
    nombre = datos.nombre_dispositivo.strip()[:80] or "Teléfono"
    u = autenticar(datos, request, sesion, detalle=f"App: {nombre}")
    d = Dispositivo(usuario_id=u.id, nombre=nombre, ultimo_uso=ahora())
    sesion.add(d)
    sesion.commit()
    return TokenDispositivo(access_token=crear_token(u.id, u.rol, d.id), usuario=UsuarioSalida.model_validate(u),
                            dispositivo=DispositivoSalida.model_validate(d))


@router.get("", response_model=list[DispositivoSalida])
def mis_dispositivos(usuario: Usuario = Depends(usuario_requerido), sesion: Session = Depends(db)):
    consulta = (select(Dispositivo).where(Dispositivo.usuario_id == usuario.id, Dispositivo.revocado.is_(False))
                .order_by(Dispositivo.creado.desc()))
    return list(sesion.scalars(consulta))


@router.delete("/{dispositivo_id}", status_code=204)
def revocar(dispositivo_id: int, request: Request, usuario: Usuario = Depends(usuario_requerido),
            sesion: Session = Depends(db)):
    """El teléfono deja de poder subir datos. Lo que ya subió se queda en el historial."""
    d = sesion.get(Dispositivo, dispositivo_id)
    if d is None or d.usuario_id != usuario.id:
        raise HTTPException(404, "Dispositivo no encontrado.")
    d.revocado = True
    auditoria.registrar(sesion, request, "dispositivo", "exito", usuario_id=usuario.id, email=usuario.email,
                        detalle=f"Teléfono desvinculado: {d.nombre}")
