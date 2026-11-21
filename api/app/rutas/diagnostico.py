import asyncio
import logging
import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.core.config import ajustes
from app.seguridad import auditoria
from app.seguridad.limites import limitador
from app.db.modelos import Diagnostico, Usuario
from app.db.sesion import db
from app.esquemas import PROVINCIAS, DiagnosticoSalida
from app.ia import imagen as lector
from app.ia.pipeline import diagnosticar
from app.ia.registro import Registro
from app.rutas.dependencias import registro_modelos, usuario_opcional

router = APIRouter(tags=["diagnóstico"])
log = logging.getLogger("fitolens.diagnostico")


def _obtener_semaforo(request: Request) -> asyncio.Semaphore:
    semaforo = getattr(request.app.state, "semaforo_inferencia", None)
    if semaforo is None:
        semaforo = asyncio.Semaphore(ajustes().inferencias_simultaneas)
        request.app.state.semaforo_inferencia = semaforo
    return semaforo


@router.post("/diagnostico", response_model=DiagnosticoSalida)
async def crear(
    request: Request,
    imagen: UploadFile = File(...),
    provincia: str | None = Form(None),
    latitud: float | None = Form(None, ge=-90, le=90),
    longitud: float | None = Form(None, ge=-180, le=180),
    origen: str = Form("web", pattern="^(web|bot|app)$"),
    usuario: Usuario | None = Depends(usuario_opcional),
    registro: Registro = Depends(registro_modelos),
    sesion: Session = Depends(db),
):
    a = ajustes()
    if not limitador.permitir(auditoria.ip_cliente(request), a.limite_diagnosticos_minuto):
        auditoria.registrar(sesion, request, "diagnostico", "bloqueado", detalle="Límite por minuto superado.")
        raise HTTPException(429, "Demasiadas fotos seguidas. Espera un minuto.")
    if provincia is not None and provincia not in PROVINCIAS:
        raise HTTPException(400, "Provincia desconocida.")
    if not registro.listo:
        raise HTTPException(503, "Los modelos no están cargados.")

    semaforo = _obtener_semaforo(request)
    try:
        await asyncio.wait_for(semaforo.acquire(), timeout=a.espera_cola_s)
    except asyncio.TimeoutError:
        raise HTTPException(503, "El servidor esta ocupado, intenta en unos segundos")

    try:
        inicio = time.perf_counter()
        foto, datos, sha = await lector.leer(imagen)
        # ONNX usa CPU varios cientos de ms: en un hilo aparte para no frenar las demás peticiones.
        r = await run_in_threadpool(diagnosticar, registro, foto)
        duracion = round((time.perf_counter() - inicio) * 1000)
    finally:
        semaforo.release()

    fila = Diagnostico(
        usuario_id=usuario.id if usuario else None, origen=origen, estado=r.estado,
        cultivo=r.cultivo, clase=r.clase, confianza=r.confianza, enferma=r.enferma,
        provincia=provincia, latitud=latitud, longitud=longitud,
        modelo_version=r.modelo_version, imagen_sha256=sha, duracion_ms=duracion,
    )
    detalle = f"{r.estado}: {r.clase or r.motivo or ''} ({r.confianza or 0:.2f})"
    await run_in_threadpool(_registrar, sesion, request, fila, r.estado, usuario, detalle)
    if a.guardar_imagenes:
        await run_in_threadpool(_guardar, datos, sha, r.cultivo or r.estado)
    del foto, datos
    log.info("diagnostico id=%s estado=%s clase=%s conf=%s ms=%s",
             fila.id, r.estado, r.clase, r.confianza, duracion)
    return DiagnosticoSalida(id=fila.id, duracion_ms=duracion, **r.__dict__)


def _registrar(sesion: Session, request: Request, fila: Diagnostico, estado: str,
               usuario: Usuario | None, detalle: str) -> None:
    """Guarda el diagnóstico y su evento de auditoría (escritura síncrona en la base de datos)."""
    sesion.add(fila)
    sesion.flush()
    auditoria.registrar(sesion, request, "diagnostico", "fallo" if estado == "rechazada" else "exito",
                        usuario_id=fila.usuario_id, email=usuario.email if usuario else None, detalle=detalle)


def _guardar(datos: bytes, sha: str, carpeta: str) -> None:
    """Fotos de campo para reentrenar. Nombre = hash: la misma foto no se guarda dos veces."""
    destino = ajustes().imagenes_dir / carpeta
    destino.mkdir(parents=True, exist_ok=True)
    (destino / f"{sha}.jpg").write_bytes(datos)
