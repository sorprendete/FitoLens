"""Alertas de brote. Públicas para el mapa; el bot de Telegram las reparte a los técnicos suscritos."""
import hashlib
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import ajustes
from app.db.modelos import Alerta, Suscripcion
from app.db.sesion import db
from app.esquemas import PROVINCIAS
from app.rutas.dependencias import admin_requerido
from app.vigilancia import nombres
from app.vigilancia.alertas import evaluar, utc

router = APIRouter(prefix="/alertas", tags=["alertas de brote"])


def clave_bot() -> str:
    """Clave del bot derivada de JWT_SECRETO (el bot lee el mismo .env): no hay que configurar nada más."""
    return hmac.new(ajustes().jwt_secreto.encode(), b"fitolens-bot", hashlib.sha256).hexdigest()[:48]


def bot_requerido(x_bot_clave: str = Header("")) -> None:
    if not hmac.compare_digest(x_bot_clave, clave_bot()):
        raise HTTPException(403, "Solo el bot de FitoLens.")


class NuevaSuscripcion(BaseModel):
    chat_id: str = Field(pattern=r"^-?\d{1,20}$")
    nombre: str = Field("", max_length=120)
    provincia: str | None = None  # None = todas las provincias


class Aviso(BaseModel):
    avisados: int = Field(ge=0)


def _etiquetas(request: Request) -> dict[str, str]:
    return nombres.etiquetas(getattr(request.app.state, "registro", None))


def _alerta(x: Alerta, etq: dict) -> dict:
    return {"id": x.id, "creado": utc(x.creado).isoformat(), "actualizada": utc(x.actualizada).isoformat(),
            "provincia": x.provincia, "provincia_nombre": nombres.provincia(x.provincia),
            "cultivo": x.cultivo, "cultivo_nombre": nombres.cultivo(x.cultivo), "clase": x.clase,
            "etiqueta": nombres.enfermedad(x.clase, etq), "casos": x.casos, "ventana_dias": x.ventana_dias,
            "notificada": x.notificada, "avisados": x.avisados}


def _suscripcion(s: Suscripcion) -> dict:
    return {"id": s.id, "chat_id": s.chat_id, "nombre": s.nombre, "provincia": s.provincia,
            "provincia_nombre": nombres.provincia(s.provincia) if s.provincia else "Todas", "creado": utc(s.creado).isoformat()}


def _validar(provincia: str | None) -> None:
    if provincia is not None and provincia not in PROVINCIAS:
        raise HTTPException(400, "Provincia desconocida.")


@router.get("")
def activas(request: Request, sesion: Session = Depends(db)):
    """Brotes vigentes: al menos ALERTA_UMBRAL_CASOS casos en ALERTA_VENTANA_DIAS días, misma provincia y enfermedad."""
    a, etq = ajustes(), _etiquetas(request)
    return {"umbral": a.alerta_umbral_casos, "ventana_dias": a.alerta_ventana_dias,
            "alertas": [_alerta(x, etq) for x in evaluar(sesion)]}


# --- Bot de Telegram ---

@router.get("/pendientes", dependencies=[Depends(bot_requerido)])
def pendientes(request: Request, sesion: Session = Depends(db)):
    """Alertas aún no avisadas, con los chats que deben recibirlas. El bot pregunta cada minuto."""
    etq, salida = _etiquetas(request), []
    for x in evaluar(sesion):
        if x.notificada:
            continue
        chats = sesion.scalars(select(Suscripcion.chat_id).where(
            or_(Suscripcion.provincia == x.provincia, Suscripcion.provincia.is_(None)))).all()
        salida.append({**_alerta(x, etq), "chats": sorted(set(chats))})
    return {"alertas": salida}


@router.post("/{alerta_id}/notificada", dependencies=[Depends(bot_requerido)])
def notificada(alerta_id: int, aviso: Aviso, sesion: Session = Depends(db)):
    x = sesion.get(Alerta, alerta_id)
    if x is None:
        raise HTTPException(404, "Alerta no encontrada.")
    x.notificada, x.avisados = True, aviso.avisados
    sesion.commit()
    return {"id": x.id, "avisados": x.avisados}


def _suscribir(sesion: Session, datos: NuevaSuscripcion) -> dict:
    _validar(datos.provincia)
    existente = sesion.scalar(select(Suscripcion).where(
        Suscripcion.chat_id == datos.chat_id,
        Suscripcion.provincia.is_(None) if datos.provincia is None else Suscripcion.provincia == datos.provincia))
    if existente:
        return _suscripcion(existente)
    s = Suscripcion(chat_id=datos.chat_id, nombre=datos.nombre.strip(), provincia=datos.provincia)
    sesion.add(s)
    try:
        sesion.commit()
    except IntegrityError:  # dos pedidos iguales a la vez
        sesion.rollback()
        raise HTTPException(409, "Ya estaba suscrito.")
    return _suscripcion(s)


@router.post("/suscripciones/bot", dependencies=[Depends(bot_requerido)])
def suscribir_bot(datos: NuevaSuscripcion, sesion: Session = Depends(db)):
    return _suscribir(sesion, datos)


@router.get("/suscripciones/bot/{chat_id}", dependencies=[Depends(bot_requerido)])
def mis_suscripciones(chat_id: str, sesion: Session = Depends(db)):
    return [_suscripcion(s) for s in sesion.scalars(select(Suscripcion).where(Suscripcion.chat_id == chat_id))]


@router.delete("/suscripciones/bot/{chat_id}", dependencies=[Depends(bot_requerido)])
def desuscribir_bot(chat_id: str, sesion: Session = Depends(db)):
    n = sesion.execute(delete(Suscripcion).where(Suscripcion.chat_id == chat_id)).rowcount
    sesion.commit()
    return {"borradas": n}


# --- Administración ---

@router.get("/suscripciones", dependencies=[Depends(admin_requerido)])
def suscripciones(sesion: Session = Depends(db)):
    return [_suscripcion(s) for s in sesion.scalars(select(Suscripcion).order_by(Suscripcion.creado.desc()))]


@router.post("/suscripciones", dependencies=[Depends(admin_requerido)])
def suscribir_admin(datos: NuevaSuscripcion, sesion: Session = Depends(db)):
    return _suscribir(sesion, datos)


@router.delete("/suscripciones/{sus_id}", dependencies=[Depends(admin_requerido)], status_code=204)
def borrar(sus_id: int, sesion: Session = Depends(db)):
    s = sesion.get(Suscripcion, sus_id)
    if s is None:
        raise HTTPException(404, "Suscripción no encontrada.")
    sesion.delete(s)
    sesion.commit()
