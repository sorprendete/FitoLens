"""Detección de brotes. Sin tareas en segundo plano: se evalúa cada vez que alguien consulta las alertas
(la web del mapa de brotes y el bot, que pregunta cada minuto). Así una alerta aparece en menos de un minuto."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import ajustes
from app.db.modelos import Alerta, Diagnostico


def utc(f: datetime) -> datetime:
    """SQLite devuelve fechas sin zona horaria; PostgreSQL, con zona. Todo se trata como UTC."""
    return f if f.tzinfo else f.replace(tzinfo=timezone.utc)


def evaluar(sesion: Session, ahora: datetime | None = None) -> list[Alerta]:
    """Crea o actualiza alertas. Devuelve las alertas activas (con casos dentro de la ventana)."""
    a = ajustes()
    ahora = ahora or datetime.now(timezone.utc)
    desde = ahora - timedelta(days=a.alerta_ventana_dias)
    conteos = sesion.execute(
        select(Diagnostico.provincia, Diagnostico.cultivo, Diagnostico.clase, func.count())
        .where(Diagnostico.estado == "diagnostico", Diagnostico.enferma.is_(True),
               Diagnostico.provincia.is_not(None), Diagnostico.clase.is_not(None),
               Diagnostico.creado >= desde)
        .group_by(Diagnostico.provincia, Diagnostico.cultivo, Diagnostico.clase)
    ).all()
    activas = {(x.provincia, x.clase): x for x in sesion.scalars(select(Alerta).where(Alerta.actualizada >= desde))}
    cambio, vigentes = False, []
    for provincia, cultivo, clase, n in conteos:
        if n < a.alerta_umbral_casos:
            continue
        alerta = activas.get((provincia, clase))
        if alerta is None:
            alerta = Alerta(provincia=provincia, cultivo=cultivo, clase=clase, casos=n, notificada=False,
                            avisados=0, ventana_dias=a.alerta_ventana_dias, creado=ahora, actualizada=ahora)
            sesion.add(alerta)
            cambio = True
        elif n != alerta.casos:
            # Solo se renueva si crecen los casos: una alerta sin casos nuevos caduca al pasar la ventana.
            if n > alerta.casos:
                alerta.actualizada = ahora
            alerta.casos = n
            cambio = True
        vigentes.append(alerta)
    if cambio:
        sesion.commit()
    return sorted(vigentes, key=lambda x: -x.casos)
