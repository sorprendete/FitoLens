import hashlib

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy.orm import Session

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
                  sesion: Session = Depends(db)):
    """PDF de un diagnóstico. Se envía la MISMA foto que se diagnosticó: el servidor no guarda fotos
    y así nadie puede armar un reporte con una foto distinta (se compara la huella SHA-256)."""
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
    return Response(generar(d, foto), media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="fitolens-reporte-{d.id}.pdf"'})
