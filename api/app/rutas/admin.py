"""Panel de administración: resumen, usuarios, auditoría y detección de amenazas. Solo rol admin."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.modelos import Auditoria, Diagnostico, Usuario
from app.db.sesion import db
from app.esquemas import CambioEstado, EventoAuditoria, Resumen, UsuarioAdmin
from app.rutas.dependencias import admin_requerido
from app.seguridad import amenazas, auditoria, simulacion

router = APIRouter(prefix="/admin", tags=["administración"], dependencies=[Depends(admin_requerido)])

ACCIONES = {"login", "registro", "diagnostico", "admin"}
ESTADOS = {"exito", "fallo", "bloqueado"}


def _contar(sesion: Session, modelo, *condiciones) -> int:
    return sesion.scalar(select(func.count()).select_from(modelo).where(*condiciones))


@router.get("/resumen", response_model=Resumen)
def resumen(sesion: Session = Depends(db)):
    hace_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    D, A = Diagnostico, Auditoria
    concluyentes = (D.estado == "diagnostico",)
    return Resumen(
        usuarios=_contar(sesion, Usuario),
        analisis=_contar(sesion, D),
        sanos=_contar(sesion, D, *concluyentes, D.enferma.is_(False)),
        enfermos=_contar(sesion, D, *concluyentes, D.enferma.is_(True)),
        no_concluyentes=_contar(sesion, D, D.estado == "no_concluyente"),
        rechazadas=_contar(sesion, D, D.estado == "rechazada"),
        logins_fallidos_24h=_contar(sesion, A, A.accion == "login", A.estado == "fallo", A.fecha >= hace_24h),
        bloqueos_24h=_contar(sesion, A, A.estado == "bloqueado", A.fecha >= hace_24h),
    )


@router.get("/usuarios", response_model=list[UsuarioAdmin])
def usuarios(sesion: Session = Depends(db)):
    n = (select(Diagnostico.usuario_id, func.count().label("n"))
         .group_by(Diagnostico.usuario_id).subquery())
    filas = sesion.execute(
        select(Usuario, func.coalesce(n.c.n, 0))
        .outerjoin(n, n.c.usuario_id == Usuario.id)
        .order_by(Usuario.creado.desc())
    ).all()
    return [UsuarioAdmin(id=u.id, nombre=u.nombre, email=u.email, rol=u.rol, activo=u.activo,
                         creado=u.creado, ultimo_acceso=u.ultimo_acceso, diagnosticos=total)
            for u, total in filas]


@router.post("/usuarios/{usuario_id}/estado")
def cambiar_estado(usuario_id: int, datos: CambioEstado, request: Request,
                   admin: Usuario = Depends(admin_requerido), sesion: Session = Depends(db)):
    if usuario_id == admin.id:
        raise HTTPException(400, "No puedes desactivar tu propia cuenta de administrador.")
    u = sesion.get(Usuario, usuario_id)
    if u is None:
        raise HTTPException(404, "Usuario no encontrado.")
    u.activo = datos.activo  # una cuenta desactivada pierde el acceso al instante (se revisa en cada petición)
    auditoria.registrar(sesion, request, "admin", "exito", usuario_id=admin.id, email=admin.email,
                        detalle=f"Cuenta {u.email} {'activada' if datos.activo else 'desactivada'}.")
    return {"id": u.id, "activo": u.activo}


@router.get("/auditoria", response_model=list[EventoAuditoria])
def registro_auditoria(limite: int = Query(100, ge=1, le=500), desde: int = Query(0, ge=0),
                       accion: str | None = None, estado: str | None = None, sesion: Session = Depends(db)):
    consulta = select(Auditoria).order_by(Auditoria.fecha.desc(), Auditoria.id.desc()).offset(desde).limit(limite)
    if accion in ACCIONES:
        consulta = consulta.where(Auditoria.accion == accion)
    if estado in ESTADOS:
        consulta = consulta.where(Auditoria.estado == estado)
    return list(sesion.scalars(consulta))


@router.get("/amenazas")
def detectar_amenazas(dias: int = Query(7, ge=1, le=90), simulado: bool = False,
                            sesion: Session = Depends(db)):
    """Reglas + Isolation Forest sobre la auditoría. simulado=true usa tráfico de prueba (para la demo)."""
    if simulado:
        eventos = simulacion.generar(dias=dias)
    else:
        desde = datetime.now(timezone.utc) - timedelta(days=dias)
        filas = sesion.scalars(select(Auditoria).where(Auditoria.fecha >= desde)
                               .order_by(Auditoria.fecha).limit(50_000))
        eventos = [{"fecha": f.fecha, "accion": f.accion, "estado": f.estado, "email": f.email,
                    "ip": f.ip, "agente": f.agente} for f in filas]
    informe = amenazas.analizar(eventos)
    return {"fuente": "simulado" if simulado else "real", "dias": dias, **informe}
