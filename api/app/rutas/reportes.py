"""Reporte semanal para autoridades (provincia × cultivo). Solo rol admin. JSON para la web, Excel y PDF para descargar."""
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db.sesion import db
from app.rutas.dependencias import admin_requerido
from app.vigilancia import excel, nombres, pdf, reporte

router = APIRouter(prefix="/reportes", tags=["reportes"], dependencies=[Depends(admin_requerido)])


def _generar(request: Request, sesion: Session, semanas: int, hasta: date | None) -> dict:
    etq = nombres.etiquetas(getattr(request.app.state, "registro", None))
    return reporte.generar(sesion, semanas, hasta, etq)


@router.get("/semanal")
def semanal(request: Request, semanas: int = Query(4, ge=1, le=26), hasta: date | None = None,
            sesion: Session = Depends(db)):
    return _generar(request, sesion, semanas, hasta)


@router.get("/semanal.xlsx")
def semanal_excel(request: Request, semanas: int = Query(4, ge=1, le=26), hasta: date | None = None,
                  sesion: Session = Depends(db)):
    r = _generar(request, sesion, semanas, hasta)
    return Response(excel.exportar(r),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="fitolens_reporte_{r["hasta"]}.xlsx"'})


@router.get("/semanal.pdf")
def semanal_pdf(request: Request, semanas: int = Query(4, ge=1, le=26), hasta: date | None = None,
                sesion: Session = Depends(db)):
    r = _generar(request, sesion, semanas, hasta)
    return Response(pdf.exportar(r),
                    media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="fitolens_reporte_{r["hasta"]}.pdf"'})
