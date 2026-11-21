from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.modelos import Diagnostico, Parcela, Usuario, VisitaParcela
from app.db.sesion import db
from app.esquemas import Historial, ItemHistorial
from app.rutas.dependencias import usuario_requerido
from app.seguridad import auditoria

router = APIRouter(tags=["historial"])


@router.get("/historial", response_model=Historial)
def historial(limite: int = Query(50, ge=1, le=500),
              sin_parcela: bool = Query(False),
              usuario: Usuario = Depends(usuario_requerido),
              sesion: Session = Depends(db)):
    """El usuario ve sus diagnósticos; el admin ve todos.

    Permite filtrar con `sin_parcela=true` para mostrar solo diagnósticos no asignados a ninguna parcela.
    Cada elemento incluye `parcela_id` y `parcela_nombre` si está asignado a una parcela.
    """
    consulta = select(Diagnostico).order_by(Diagnostico.creado.desc())
    if usuario.rol != "admin":
        consulta = consulta.where(Diagnostico.usuario_id == usuario.id)
    if sin_parcela:
        subq = (
            select(VisitaParcela.diagnostico_id)
            .where(VisitaParcela.diagnostico_id.is_not(None))
        )
        consulta = consulta.where(Diagnostico.id.notin_(subq))
    consulta = consulta.limit(limite)
    diagnosticos = list(sesion.scalars(consulta))
    if not diagnosticos:
        return Historial(items=[])

    diag_ids = [d.id for d in diagnosticos]
    filas_parcela = sesion.execute(
        select(VisitaParcela.diagnostico_id, Parcela.id, Parcela.nombre)
        .join(Parcela, Parcela.id == VisitaParcela.parcela_id)
        .where(VisitaParcela.diagnostico_id.in_(diag_ids))
    ).all()
    mapa_parcela = {did: (pid, pnombre) for did, pid, pnombre in filas_parcela}

    items = []
    for d in diagnosticos:
        p_info = mapa_parcela.get(d.id)
        items.append(ItemHistorial(
            id=d.id,
            creado=d.creado,
            origen=d.origen,
            cultivo=d.cultivo,
            estado=d.estado,
            clase=d.clase,
            confianza=d.confianza,
            provincia=d.provincia,
            parcela_id=p_info[0] if p_info else None,
            parcela_nombre=p_info[1] if p_info else None,
        ))
    return Historial(items=items)


@router.delete("/historial/{diagnostico_id}", status_code=204)
def borrar_diagnostico(diagnostico_id: int, request: Request,
                       usuario: Usuario = Depends(usuario_requerido),
                       sesion: Session = Depends(db)):
    """Borra un diagnóstico propio. Las visitas que lo apuntan quedan con diagnostico_id NULL."""
    d = sesion.get(Diagnostico, diagnostico_id)
    if d is None or d.usuario_id != usuario.id:
        raise HTTPException(404, "Diagnóstico no encontrado.")

    visitas = list(sesion.scalars(select(VisitaParcela).where(VisitaParcela.diagnostico_id == d.id)))
    for v in visitas:
        v.diagnostico_id = None
    sesion.flush()

    sesion.delete(d)
    auditoria.registrar(sesion, request, "diagnostico", "exito", usuario_id=usuario.id,
                        email=usuario.email, detalle=f"Diagnóstico {diagnostico_id} eliminado.")
    return Response(status_code=204)
