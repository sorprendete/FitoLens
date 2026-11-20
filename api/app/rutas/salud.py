from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

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
        "errores_modelos": registro.errores,
    }
    # 200 aunque falten modelos: el contenedor está vivo; la web muestra el aviso.
    return JSONResponse(cuerpo, status_code=200 if base_ok else 503)
