import logging
import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.config import ajustes
from app.core.seguridad import limitador
from app.db.modelos import Diagnostico, Usuario
from app.db.sesion import db
from app.esquemas import PROVINCIAS, DiagnosticoSalida
from app.ia import imagen as lector
from app.ia.pipeline import diagnosticar
from app.ia.registro import Registro
from app.rutas.dependencias import ip_cliente, registro_modelos, usuario_opcional

router = APIRouter(tags=["diagnóstico"])
log = logging.getLogger("fitolens.diagnostico")


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
    if not limitador.permitir(ip_cliente(request), a.limite_diagnosticos_minuto):
        raise HTTPException(429, "Demasiadas fotos seguidas. Espera un minuto.")
    if provincia is not None and provincia not in PROVINCIAS:
        raise HTTPException(400, "Provincia desconocida.")
    if not registro.listo:
        raise HTTPException(503, "Los modelos no están cargados.")

    inicio = time.perf_counter()
    foto, datos, sha = await lector.leer(imagen)
    r = diagnosticar(registro, foto)
    duracion = round((time.perf_counter() - inicio) * 1000)

    fila = Diagnostico(
        usuario_id=usuario.id if usuario else None, origen=origen, estado=r.estado,
        cultivo=r.cultivo, clase=r.clase, confianza=r.confianza, enferma=r.enferma,
        provincia=provincia, latitud=latitud, longitud=longitud,
        modelo_version=r.modelo_version, imagen_sha256=sha, duracion_ms=duracion,
    )
    sesion.add(fila)
    sesion.commit()
    if a.guardar_imagenes:
        _guardar(datos, sha, r.cultivo or r.estado)
    log.info("diagnostico id=%s estado=%s clase=%s conf=%s ms=%s",
             fila.id, r.estado, r.clase, r.confianza, duracion)
    return DiagnosticoSalida(id=fila.id, duracion_ms=duracion, **r.__dict__)


def _guardar(datos: bytes, sha: str, carpeta: str) -> None:
    """Fotos de campo para reentrenar. Nombre = hash: la misma foto no se guarda dos veces."""
    destino = ajustes().imagenes_dir / carpeta
    destino.mkdir(parents=True, exist_ok=True)
    (destino / f"{sha}.jpg").write_bytes(datos)
