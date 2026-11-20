from fastapi import APIRouter, Depends

from app.ia.registro import Registro
from app.rutas.dependencias import registro_modelos

router = APIRouter(tags=["métricas"])


@router.get("/metricas")
def metricas(registro: Registro = Depends(registro_modelos)):
    """Ficha de cada modelo: manifest + metricas.json (medidas en fotos de campo)."""
    modelos = []
    for m in registro.modelos.values():
        man = m.manifest
        cultivos = sorted({c.cultivo for c in man.clases if c.cultivo})
        modelos.append({
            "id": man.nombre,
            "tipo": man.tipo,
            "cultivo": cultivos[0] if len(cultivos) == 1 else None,
            "cultivos": cultivos,
            "version": man.version,
            "backbone": man.backbone,
            "clases": man.ids,
            "etiquetas": {c.id: c.etiqueta for c in man.clases},
            "umbral": man.umbral,
            "temperatura": man.temperatura,
            "entrenado": man.entrenado,
            **m.metricas,
        })
    return {"modelos": modelos}
