"""Punto de entrada: `uvicorn app.main:app`. Carga modelos al arrancar y monta las rutas en /api."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import ajustes
from app.core.logs import configurar_logs
from app.db.sesion import fabrica
from app.ia.registro import cargar
from app.rutas import admin, auth, brotes, diagnostico, historial, metricas, salud


@asynccontextmanager
async def ciclo(app: FastAPI):
    a = ajustes()
    configurar_logs(a.log_nivel)
    app.state.registro = cargar(a.modelos_dir, a.ort_hilos)
    with fabrica()() as sesion:
        auth.asegurar_admin(sesion)
    yield


def crear_app() -> FastAPI:
    app = FastAPI(title="FitoLens API", version="1.0.0", lifespan=ciclo,
                  docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    if ajustes().cors_lista:
        app.add_middleware(CORSMiddleware, allow_origins=ajustes().cors_lista,
                           allow_methods=["*"], allow_headers=["*"])
    for modulo in (diagnostico, metricas, brotes, auth, historial, admin, salud):
        app.include_router(modulo.router, prefix="/api")
    return app


app = crear_app()
