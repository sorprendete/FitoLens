"""Seguimiento de parcelas: el agricultor registra su parcela, anota cada visita (severidad,
tratamiento y, si tomó foto, el diagnóstico) y ve si la parcela mejora después del tratamiento.

Severidad (estimada por el agricultor, escala de campo de 4 niveles):
0 sin síntomas · 1 leve (menos del 10 % de hojas o frutos) · 2 moderada (10 a 30 %) · 3 grave (más del 30 %).
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.modelos import Diagnostico, Parcela, Usuario, VisitaParcela
from app.db.sesion import db
from app.esquemas import PROVINCIAS
from app.rutas.dependencias import usuario_requerido

router = APIRouter(tags=["parcelas"])

CULTIVOS = ("cafe", "cacao", "papa", "tomate", "pimiento")


class ParcelaEntrada(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    cultivo: str
    provincia: str | None = None
    latitud: float | None = Field(None, ge=-90, le=90)
    longitud: float | None = Field(None, ge=-180, le=180)


class VisitaEntrada(BaseModel):
    diagnostico_id: int | None = None
    severidad: int | None = Field(None, ge=0, le=3)
    tratamiento: str | None = Field(None, max_length=300)
    nota: str | None = Field(None, max_length=500)
    fecha: datetime | None = None


class VisitaSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    fecha: datetime
    severidad: int
    tratamiento: str | None
    nota: str | None
    diagnostico_id: int | None
    clase: str | None = None
    confianza: float | None = None
    estado: str | None = None


class ParcelaResumen(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    cultivo: str
    provincia: str | None
    latitud: float | None
    longitud: float | None
    creado: datetime
    visitas: int = 0
    severidad_actual: int | None = None
    tendencia: str = "sin_datos"  # mejora | empeora | igual | sin_datos
    ultima_visita: datetime | None = None


class ParcelaDetalle(ParcelaResumen):
    historial: list[VisitaSalida]


class Parcelas(BaseModel):
    items: list[ParcelaResumen]


def tendencia(visitas: list[VisitaParcela]) -> str:
    """Compara la última visita con la visita en que se aplicó el primer tratamiento
    (o con la primera visita, si aún no hay tratamiento)."""
    if len(visitas) < 2:
        return "sin_datos"
    base = next((v for v in visitas if v.tratamiento), visitas[0])
    if base is visitas[-1]:
        return "sin_datos"
    d = visitas[-1].severidad - base.severidad
    return "mejora" if d < 0 else "empeora" if d > 0 else "igual"


def _visitas(sesion: Session, parcela_id: int) -> list[VisitaParcela]:
    return list(sesion.scalars(select(VisitaParcela).where(VisitaParcela.parcela_id == parcela_id)
                               .order_by(VisitaParcela.fecha, VisitaParcela.id)))


def _resumen(p: Parcela, visitas: list[VisitaParcela], clase=ParcelaResumen, **extra):
    return clase.model_validate({
        **{k: getattr(p, k) for k in ("id", "nombre", "cultivo", "provincia", "latitud", "longitud", "creado")},
        "visitas": len(visitas), "tendencia": tendencia(visitas),
        "severidad_actual": visitas[-1].severidad if visitas else None,
        "ultima_visita": visitas[-1].fecha if visitas else None, **extra,
    })


def _propia(sesion: Session, parcela_id: int, usuario: Usuario) -> Parcela:
    p = sesion.get(Parcela, parcela_id)
    if p is None or (p.usuario_id != usuario.id and usuario.rol != "admin"):
        raise HTTPException(404, "Parcela no encontrada.")
    return p


def _validar(datos: ParcelaEntrada) -> None:
    if datos.cultivo not in CULTIVOS:
        raise HTTPException(400, "Cultivo desconocido.")
    if datos.provincia is not None and datos.provincia not in PROVINCIAS:
        raise HTTPException(400, "Provincia desconocida.")


@router.get("/parcelas", response_model=Parcelas)
def listar(usuario: Usuario = Depends(usuario_requerido), sesion: Session = Depends(db)):
    """Parcelas del usuario, con su severidad actual y tendencia."""
    filas = sesion.scalars(select(Parcela).where(Parcela.usuario_id == usuario.id).order_by(Parcela.creado.desc()))
    return Parcelas(items=[_resumen(p, _visitas(sesion, p.id)) for p in filas])


@router.post("/parcelas", response_model=ParcelaResumen, status_code=201)
def crear(datos: ParcelaEntrada, usuario: Usuario = Depends(usuario_requerido), sesion: Session = Depends(db)):
    _validar(datos)
    p = Parcela(usuario_id=usuario.id, **datos.model_dump())
    sesion.add(p)
    sesion.commit()
    return _resumen(p, [])


@router.get("/parcelas/{parcela_id}", response_model=ParcelaDetalle)
def detalle(parcela_id: int, usuario: Usuario = Depends(usuario_requerido), sesion: Session = Depends(db)):
    """Parcela con su línea de tiempo de visitas (de la más antigua a la más reciente)."""
    p = _propia(sesion, parcela_id, usuario)
    visitas = _visitas(sesion, p.id)
    ids = [v.diagnostico_id for v in visitas if v.diagnostico_id]
    diags = {d.id: d for d in sesion.scalars(select(Diagnostico).where(Diagnostico.id.in_(ids)))} if ids else {}
    historial = []
    for v in visitas:
        d = diags.get(v.diagnostico_id)
        historial.append(VisitaSalida.model_validate(v).model_copy(update=(
            {"clase": d.clase, "confianza": d.confianza, "estado": d.estado} if d else {})))
    return _resumen(p, visitas, ParcelaDetalle, historial=historial)


@router.put("/parcelas/{parcela_id}", response_model=ParcelaResumen)
def editar(parcela_id: int, datos: ParcelaEntrada, usuario: Usuario = Depends(usuario_requerido),
           sesion: Session = Depends(db)):
    p = _propia(sesion, parcela_id, usuario)
    _validar(datos)
    for k, v in datos.model_dump().items():
        setattr(p, k, v)
    sesion.commit()
    return _resumen(p, _visitas(sesion, p.id))


@router.delete("/parcelas/{parcela_id}", status_code=204)
def borrar(parcela_id: int, usuario: Usuario = Depends(usuario_requerido), sesion: Session = Depends(db)):
    """Borra la parcela y sus visitas. Los diagnósticos se conservan (mapa de brotes e historial)."""
    p = _propia(sesion, parcela_id, usuario)
    for v in _visitas(sesion, p.id):
        sesion.delete(v)
    sesion.delete(p)
    sesion.commit()
    return Response(status_code=204)


@router.post("/parcelas/{parcela_id}/visitas", response_model=VisitaSalida, status_code=201)
def agregar_visita(parcela_id: int, datos: VisitaEntrada, usuario: Usuario = Depends(usuario_requerido),
                   sesion: Session = Depends(db)):
    """Anota una visita. Con `diagnostico_id` se enlaza una foto ya diagnosticada (POST /api/diagnostico)."""
    p = _propia(sesion, parcela_id, usuario)
    d = None
    if datos.diagnostico_id is not None:
        d = sesion.get(Diagnostico, datos.diagnostico_id)
        if d is None or d.usuario_id != p.usuario_id:
            raise HTTPException(404, "Diagnóstico no encontrado.")
        if d.estado == "rechazada":
            raise HTTPException(400, "Esa foto fue rechazada: toma otra de la planta.")
        if d.cultivo and d.cultivo != p.cultivo:
            raise HTTPException(400, f"La foto es de {d.cultivo} y la parcela es de {p.cultivo}.")
        if sesion.scalar(select(VisitaParcela.id).where(VisitaParcela.diagnostico_id == d.id)):
            raise HTTPException(409, "Ese diagnóstico ya está en una parcela.")
    severidad = datos.severidad
    if severidad is None:
        if d is not None and d.estado == "diagnostico" and not d.enferma:
            severidad = 0  # la IA dice que está sana
        else:
            raise HTTPException(422, "Indica la severidad (0 a 3).")
    v = VisitaParcela(parcela_id=p.id, diagnostico_id=d.id if d else None, severidad=severidad,
                      tratamiento=(datos.tratamiento or "").strip() or None, nota=(datos.nota or "").strip() or None)
    if datos.fecha:
        v.fecha = datos.fecha
    sesion.add(v)
    sesion.commit()
    extra = {"clase": d.clase, "confianza": d.confianza, "estado": d.estado} if d else {}
    return VisitaSalida.model_validate(v).model_copy(update=extra)


@router.delete("/parcelas/{parcela_id}/visitas/{visita_id}", status_code=204)
def borrar_visita(parcela_id: int, visita_id: int, usuario: Usuario = Depends(usuario_requerido),
                  sesion: Session = Depends(db)):
    p = _propia(sesion, parcela_id, usuario)
    v = sesion.get(VisitaParcela, visita_id)
    if v is None or v.parcela_id != p.id:
        raise HTTPException(404, "Visita no encontrada.")
    sesion.delete(v)
    sesion.commit()
    return Response(status_code=204)
