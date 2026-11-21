"""Subida de los diagnósticos que la app hizo sin internet.

Se guarda el resultado que vio el agricultor en el teléfono (no se vuelve a diagnosticar) con la fecha
y el lugar reales de la foto. Cada diagnóstico trae un id_cliente: si llega dos veces, no se duplica.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import ajustes
from app.db.modelos import Diagnostico, Usuario, ahora
from app.db.sesion import db
from app.esquemas import PROVINCIAS, Sincronizado
from app.ia import imagen as lector
from app.rutas.dependencias import usuario_requerido
from app.rutas.diagnostico import _guardar
from app.seguridad import auditoria
from app.seguridad.limites import limitador

router = APIRouter(tags=["sincronizar"])

UUID = r"^[0-9a-fA-F-]{8,36}$"
NOMBRE = r"^[a-z0-9_]{1,80}$"


def _fecha(texto: str | None) -> datetime:
    """Fecha de la foto según el teléfono. Si falta o no es creíble (futuro o más de un año), la de llegada."""
    hoy = ahora()
    try:
        f = datetime.fromisoformat(texto.replace("Z", "+00:00")) if texto else None
    except ValueError:
        f = None
    if f is None:
        return hoy
    if f.tzinfo is None:
        f = f.replace(tzinfo=timezone.utc)
    return f if hoy - timedelta(days=365) <= f <= hoy + timedelta(minutes=10) else hoy


@router.post("/sincronizar", response_model=Sincronizado)
async def sincronizar(
    request: Request,
    imagen: UploadFile = File(...),
    id_cliente: str = Form(..., pattern=UUID),
    estado: str = Form(..., pattern="^(diagnostico|no_concluyente|rechazada)$"),
    cultivo: str | None = Form(None, pattern=NOMBRE),
    clase: str | None = Form(None, pattern=NOMBRE),
    confianza: float | None = Form(None, ge=0, le=1),
    modelo_version: str = Form("", max_length=120),
    duracion_ms: int = Form(0, ge=0, le=600_000),
    fecha: str | None = Form(None, max_length=40),
    provincia: str | None = Form(None),
    latitud: float | None = Form(None, ge=-90, le=90),
    longitud: float | None = Form(None, ge=-180, le=180),
    usuario: Usuario = Depends(usuario_requerido),
    sesion: Session = Depends(db),
):
    if not limitador.permitir(f"sincronizar:{usuario.id}", 120):
        raise HTTPException(429, "Demasiadas sincronizaciones seguidas. Espera un minuto.")
    id_cliente = id_cliente.lower()
    previo = sesion.scalar(select(Diagnostico).where(Diagnostico.id_cliente == id_cliente))
    if previo is not None:
        if previo.usuario_id != usuario.id:
            raise HTTPException(409, "Ese diagnóstico pertenece a otra cuenta.")
        sesion.commit()  # guarda ultimo_uso del dispositivo
        return Sincronizado(id=previo.id, id_cliente=id_cliente, nuevo=False)

    if provincia is not None and provincia not in PROVINCIAS:
        raise HTTPException(400, "Provincia desconocida.")
    if estado == "diagnostico" and not clase:
        raise HTTPException(422, "Falta la clase del diagnóstico.")
    if estado != "diagnostico":
        clase = None

    _, datos, sha = await lector.leer(imagen)
    fila = Diagnostico(
        usuario_id=usuario.id, origen="app", estado=estado, cultivo=cultivo, clase=clase,
        confianza=confianza, enferma=bool(clase) and not clase.endswith("_sana"),
        provincia=provincia, latitud=latitud, longitud=longitud, creado=_fecha(fecha),
        modelo_version=modelo_version or "app", imagen_sha256=sha, duracion_ms=duracion_ms, id_cliente=id_cliente,
    )
    sesion.add(fila)
    try:
        sesion.flush()
    except IntegrityError:  # el mismo diagnóstico llegó dos veces a la vez
        sesion.rollback()
        previo = sesion.scalar(select(Diagnostico).where(Diagnostico.id_cliente == id_cliente))
        if previo is None or previo.usuario_id != usuario.id:
            raise HTTPException(409, "Ese diagnóstico pertenece a otra cuenta.")
        return Sincronizado(id=previo.id, id_cliente=id_cliente, nuevo=False)
    auditoria.registrar(sesion, request, "diagnostico", "exito", usuario_id=usuario.id, email=usuario.email,
                        detalle=f"App sin internet: {estado} {clase or ''} ({confianza or 0:.2f})")
    if ajustes().guardar_imagenes:
        await run_in_threadpool(_guardar, datos, sha, cultivo or estado)
    return Sincronizado(id=fila.id, id_cliente=id_cliente, nuevo=True)
