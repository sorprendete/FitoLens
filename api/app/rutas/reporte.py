import hashlib

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.ia.pipeline import diagnosticar
from app.ia.registro import Registro
from app.rutas.dependencias import registro_modelos

from app.core.config import ajustes
from app.db.modelos import Diagnostico
from app.db.sesion import db
from app.ia import imagen as lector
from app.reporte.pdf import generar
from app.seguridad import auditoria
from app.seguridad.limites import limitador

router = APIRouter(tags=["reporte"])


@router.post("/reporte/{diagnostico_id}", response_class=Response,
             responses={200: {"content": {"application/pdf": {}}}})
async def reporte(diagnostico_id: int, request: Request, imagen: UploadFile = File(...),
                  sesion: Session = Depends(db), registro: Registro = Depends(registro_modelos)):
    """PDF de un diagnóstico. Se envía la MISMA foto que se diagnosticó: el servidor no guarda fotos
    y así nadie puede armar un reporte con una foto distinta (se compara la huella SHA-256).
    El mapa de calor se recalcula con el modelo (nunca se acepta uno enviado por el cliente)."""
    ip = auditoria.ip_cliente(request)
    if not limitador.permitir(f"reporte:{ip}", ajustes().limite_diagnosticos_minuto):
        raise HTTPException(429, "Demasiados reportes seguidos. Espera un minuto.")
    d = sesion.get(Diagnostico, diagnostico_id)
    if d is None:
        raise HTTPException(404, "Diagnóstico no encontrado.")
    if d.estado != "diagnostico":
        raise HTTPException(409, "Solo hay reporte para diagnósticos concluyentes.")
    foto, datos, sha = await lector.leer(imagen)
    if sha != d.imagen_sha256:
        raise HTTPException(400, "La foto no corresponde a este diagnóstico.")
    img_calor = None
    if registro.listo:
        try:
            r = await run_in_threadpool(diagnosticar, registro, foto)
            img_calor = r.mapa_calor_png_base64
        except Exception:
            img_calor = None
    pdf = await run_in_threadpool(generar, d, foto, img_calor)
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="fitolens-reporte-{d.id}.pdf"'})
