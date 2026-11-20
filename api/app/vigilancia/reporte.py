"""Reporte semanal para autoridades: diagnósticos por provincia y cultivo, enfermedades y tendencia."""
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.modelos import Alerta, Diagnostico
from app.vigilancia import nombres
from app.vigilancia.alertas import utc


def lunes(d: date) -> date:
    return d - timedelta(days=d.weekday())


def tendencia(actual: int, anterior: int) -> tuple[str, int | None]:
    """Compara los casos con enfermedad de la última semana con los de la anterior."""
    if anterior == 0:
        return ("nuevo", None) if actual else ("estable", 0)
    pct = round((actual - anterior) / anterior * 100)
    return ("sube" if pct >= 10 else "baja" if pct <= -10 else "estable"), pct


def generar(sesion: Session, semanas: int, hasta: date | None = None, etiquetas: dict | None = None) -> dict:
    etiquetas = etiquetas or {}
    hasta = hasta or datetime.now(timezone.utc).date()
    inicios = [lunes(hasta) - timedelta(weeks=k) for k in range(semanas - 1, -1, -1)]
    desde = datetime.combine(inicios[0], time.min, timezone.utc)
    fin = datetime.combine(hasta + timedelta(days=1), time.min, timezone.utc)
    filas = sesion.execute(
        select(Diagnostico.creado, Diagnostico.provincia, Diagnostico.cultivo, Diagnostico.clase, Diagnostico.enferma)
        .where(Diagnostico.estado == "diagnostico", Diagnostico.cultivo.is_not(None),
               Diagnostico.creado >= desde, Diagnostico.creado < fin)
    ).all()

    grupos: dict[tuple, dict] = defaultdict(lambda: {"analisis": 0, "enfermos": 0, "semana": [0] * semanas,
                                                    "clases": Counter()})
    por_semana = [{"analisis": 0, "enfermos": 0} for _ in inicios]
    for creado, provincia, cultivo, clase, enferma in filas:
        i = min(semanas - 1, (lunes(utc(creado).date()) - inicios[0]).days // 7)
        g = grupos[(provincia or nombres.SIN_PROVINCIA, cultivo)]
        g["analisis"] += 1
        por_semana[i]["analisis"] += 1
        if enferma:
            g["enfermos"] += 1
            g["semana"][i] += 1
            g["clases"][clase] += 1
            por_semana[i]["enfermos"] += 1

    resultado = []
    for (provincia, cultivo), g in grupos.items():
        t, pct = tendencia(g["semana"][-1], g["semana"][-2] if semanas > 1 else 0)
        principal = g["clases"].most_common(1)
        resultado.append({
            "provincia": provincia, "provincia_nombre": nombres.provincia(provincia),
            "cultivo": cultivo, "cultivo_nombre": nombres.cultivo(cultivo),
            "analisis": g["analisis"], "enfermos": g["enfermos"], "sanos": g["analisis"] - g["enfermos"],
            "pct_enfermos": round(g["enfermos"] / g["analisis"], 3),
            "enfermos_por_semana": g["semana"], "tendencia": t, "tendencia_pct": pct,
            "principal": ({"clase": principal[0][0], "etiqueta": nombres.enfermedad(principal[0][0], etiquetas),
                           "casos": principal[0][1]} if principal else None),
            "enfermedades": [{"clase": c, "etiqueta": nombres.enfermedad(c, etiquetas), "casos": n}
                             for c, n in g["clases"].most_common()],
        })
    resultado.sort(key=lambda x: (-x["enfermos"], -x["analisis"], x["provincia_nombre"]))

    alertas = sesion.scalars(select(Alerta).where(Alerta.creado >= desde, Alerta.creado < fin)
                             .order_by(Alerta.creado.desc())).all()
    analisis = sum(s["analisis"] for s in por_semana)
    enfermos = sum(s["enfermos"] for s in por_semana)
    return {
        "desde": inicios[0].isoformat(), "hasta": hasta.isoformat(),
        "semanas": [{"inicio": d.isoformat(), **s} for d, s in zip(inicios, por_semana)],
        "totales": {"analisis": analisis, "enfermos": enfermos, "sanos": analisis - enfermos,
                    "provincias_con_casos": len({p for (p, _), g in grupos.items() if g["enfermos"]}),
                    "alertas": len(alertas)},
        "filas": resultado,
        "alertas": [{"id": x.id, "creado": utc(x.creado).isoformat(), "provincia": x.provincia,
                     "provincia_nombre": nombres.provincia(x.provincia), "cultivo": x.cultivo,
                     "cultivo_nombre": nombres.cultivo(x.cultivo),
                     "clase": x.clase, "etiqueta": nombres.enfermedad(x.clase, etiquetas), "casos": x.casos}
                    for x in alertas],
    }
