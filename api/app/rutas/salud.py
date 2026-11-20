from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import ajustes
from app.db.sesion import db
from app.ia.registro import Registro
from app.rutas.dependencias import registro_modelos

router = APIRouter(tags=["salud"])


@router.get("/salud")
def salud(registro: Registro = Depends(registro_modelos), sesion: Session = Depends(db)):
    try:
        sesion.execute(text("SELECT 1"))
        base_ok = True
    except Exception:
        base_ok = False
    cuerpo = {
        "estado": "ok" if base_ok and registro.listo else "degradado",
        "base_datos": base_ok,
        "modelos": {n: m.manifest.version for n, m in registro.modelos.items()},
        "modelos_release": ajustes().modelos_version or None,
        # True si hay algún modelo de prueba (crear_modelos_falsos.py): sus diagnósticos no son reales.
        "modelos_de_prueba": any("falso" in m.manifest.version for m in registro.modelos.values()),
        "errores_modelos": registro.errores,
    }
    # 200 aunque falten modelos: el contenedor está vivo; la web muestra el aviso.
    return JSONResponse(cuerpo, status_code=200 if base_ok else 503)
