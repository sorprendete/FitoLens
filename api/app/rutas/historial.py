from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.modelos import Diagnostico, Usuario
from app.db.sesion import db
from app.esquemas import Historial
from app.rutas.dependencias import usuario_requerido

router = APIRouter(tags=["historial"])


@router.get("/historial", response_model=Historial)
def historial(limite: int = Query(50, ge=1, le=500), usuario: Usuario = Depends(usuario_requerido),
              sesion: Session = Depends(db)):
    """El usuario ve sus diagnósticos; el admin ve todos."""
    consulta = select(Diagnostico).order_by(Diagnostico.creado.desc()).limit(limite)
    if usuario.rol != "admin":
        consulta = consulta.where(Diagnostico.usuario_id == usuario.id)
    return Historial(items=list(sesion.scalars(consulta)))
