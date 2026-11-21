"""Punto de entrada: `uvicorn app.main:app`. Carga modelos al arrancar y monta las rutas en /api."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import ajustes
from app.core.logs import configurar_logs
from app.db.sesion import fabrica
from app.ia.registro import cargar
from app.rutas import (admin, alertas, auth, brotes, diagnostico, dispositivos, historial, metricas, parcelas,
                       reporte, reportes, salud, sincronizar)

log = logging.getLogger("fitolens.api")


@asynccontextmanager
async def ciclo(app: FastAPI):
    a = ajustes()
    configurar_logs(a.log_nivel)
    app.state.registro = cargar(a.modelos_dir, a.ort_hilos, segmentar=a.segmentacion, volteo=a.volteo)
    app.state.semaforo_inferencia = asyncio.Semaphore(a.inferencias_simultaneas)
    with fabrica()() as sesion:
        auth.asegurar_admin(sesion)
    yield


def crear_app() -> FastAPI:
    app = FastAPI(title="FitoLens API", version="1.0.0", lifespan=ciclo,
                  docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)

    @app.middleware("http")
    async def cabeceras_seguridad(request: Request, call_next):
        respuesta = await call_next(request)
        respuesta.headers["X-Content-Type-Options"] = "nosniff"
        respuesta.headers["X-Frame-Options"] = "DENY"
        respuesta.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        respuesta.headers["X-XSS-Protection"] = "1; mode=block"
        return respuesta

    @app.exception_handler(Exception)
    async def error_no_controlado(request: Request, exc: Exception):
        if isinstance(exc, (StarletteHTTPException, RequestValidationError)):
            raise exc
        log.exception("Error interno no controlado en %s: %s", request.url.path, exc)
        return JSONResponse(status_code=500, content={"detail": "Error interno del servidor."})

    if ajustes().cors_lista:
        app.add_middleware(CORSMiddleware, allow_origins=ajustes().cors_lista,
                           allow_methods=["*"], allow_headers=["*"])
    for modulo in (alertas, reportes, diagnostico, sincronizar, reporte, metricas, brotes, auth, dispositivos, historial,
                   parcelas, admin, salud):
        app.include_router(modulo.router, prefix="/api")
    return app


app = crear_app()
