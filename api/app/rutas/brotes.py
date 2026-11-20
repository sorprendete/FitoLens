from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.modelos import Diagnostico
from app.db.sesion import db
from app.esquemas import Brotes, ProvinciaBrotes

router = APIRouter(tags=["brotes"])


@router.get("/brotes", response_model=Brotes)
def brotes(desde: date | None = Query(None, description="YYYY-MM-DD; por defecto, últimos 30 días"),
           sesion: Session = Depends(db)):
    """Casos de plantas enfermas por provincia de San Martín. Solo diagnósticos concluyentes."""
    desde = desde or (datetime.now(timezone.utc).date() - timedelta(days=30))
    filas = sesion.execute(
        select(Diagnostico.provincia, Diagnostico.clase, func.count())
        .where(Diagnostico.estado == "diagnostico", Diagnostico.enferma.is_(True),
               Diagnostico.provincia.is_not(None),
               Diagnostico.creado >= datetime.combine(desde, time.min, timezone.utc))
        .group_by(Diagnostico.provincia, Diagnostico.clase)
    ).all()
    por_provincia: dict[str, dict[str, int]] = defaultdict(dict)
    for provincia, clase, n in filas:
        por_provincia[provincia][clase] = n
    provincias = sorted(
        (ProvinciaBrotes(provincia=p, total=sum(c.values()), por_clase=c) for p, c in por_provincia.items()),
        key=lambda x: -x.total,
    )
    return Brotes(desde=desde.isoformat(), total=sum(p.total for p in provincias), provincias=provincias)
