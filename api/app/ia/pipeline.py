"""Diagnóstico completo: router → especialista → calibración → mapa de calor.

Cada etapa queda registrada en `pasos` para que la web muestre "cómo piensa la IA".
"""
import time
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from app.ia import mapa_calor
from app.ia.modelo import softmax
from app.ia.registro import Registro

NOMBRES_CULTIVO = {"pimiento": "pimiento", "papa": "papa", "tomate": "tomate", "cafe": "café", "cacao": "cacao"}
MOTIVOS = {
    "no_planta": "La foto no parece una planta. Toma la foto de cerca a una hoja o mazorca, con buena luz.",
    "otra_planta": "Parece otra planta. FitoLens diagnostica pimiento, papa, tomate, café y cacao.",
    "router_duda": "No se pudo reconocer el cultivo con seguridad. Prueba con una foto más cercana y nítida.",
    "sin_especialista": "Todavía no hay un modelo instalado para este cultivo.",
    "especialista_duda": (
        "El modelo no está seguro. Puede ser un problema que no conoce (plaga, deficiencia, daño "
        "mecánico) o una foto poco clara. No se emite diagnóstico para evitar un error."
    ),
}


@dataclass
class Resultado:
    estado: str  # diagnostico | no_concluyente | rechazada
    cultivo: str | None = None
    clase: str | None = None
    etiqueta: str | None = None
    confianza: float | None = None
    enferma: bool = False
    top3: list[dict] = field(default_factory=list)
    mapa_calor_png_base64: str | None = None
    pasos: list[dict] = field(default_factory=list)
    modelo_version: str = ""
    motivo: str | None = None


class _Cronometro:
    def __init__(self):
        self.t = time.perf_counter()

    def vuelta(self) -> int:
        ahora, antes = time.perf_counter(), self.t
        self.t = ahora
        return round((ahora - antes) * 1000)


def _paso(resultado: Resultado, id_: str, titulo: str, detalle: str, ms: int) -> None:
    resultado.pasos.append({"id": id_, "titulo": titulo, "detalle": detalle, "ms": ms})


def diagnosticar(registro: Registro, imagen: Image.Image) -> Resultado:
    reloj = _Cronometro()
    router = registro.router
    r = Resultado(estado="rechazada", modelo_version=router.version)

    # 1. Router: ¿qué cultivo es?
    m = router.manifest
    p = softmax(router.predecir(imagen).logits, m.temperatura)
    i = int(np.argmax(p))
    cultivo, conf = m.ids[i], float(p[i])
    _paso(r, "router", "¿Qué planta es?",
          f"{m.clases[i].etiqueta} con {conf:.0%} de confianza", reloj.vuelta())
    if cultivo in m.rechazo:
        r.motivo = MOTIVOS.get(cultivo, MOTIVOS["otra_planta"])
        return r
    if conf < m.umbral:
        r.estado, r.motivo = "no_concluyente", MOTIVOS["router_duda"]
        return r
    r.cultivo = cultivo

    # 2. Especialista del cultivo
    esp = registro.especialista(cultivo)
    if esp is None:
        r.estado, r.motivo = "no_concluyente", MOTIVOS["sin_especialista"]
        return r
    r.modelo_version = f"{router.version}+{esp.version}"
    salida = esp.predecir(imagen)
    em = esp.manifest
    # Si el especialista cubre varios cultivos, solo cuentan las clases del cultivo elegido.
    indices = [k for k, c in enumerate(em.clases) if c.cultivo in (None, cultivo)]
    _paso(r, "especialista", f"Modelo de {NOMBRES_CULTIVO.get(cultivo, cultivo)}",
          f"Compara la foto con {len(indices)} condiciones que conoce", reloj.vuelta())

    # 3. Calibración y umbral
    p = softmax(salida.logits[indices], em.temperatura)
    orden = np.argsort(p)[::-1]
    r.top3 = [{"clase": em.clases[indices[k]].id, "etiqueta": em.clases[indices[k]].etiqueta,
               "confianza": round(float(p[k]), 4)} for k in orden[:3]]
    mejor = indices[orden[0]]
    clase, r.confianza = em.clases[mejor], round(float(p[orden[0]]), 4)
    _paso(r, "calibracion", "¿Qué tan segura está?",
          f"Confianza calibrada {r.confianza:.0%}; mínimo exigido {em.umbral:.0%}", reloj.vuelta())
    if r.confianza < em.umbral:
        r.estado, r.motivo = "no_concluyente", MOTIVOS["especialista_duda"]
    else:
        r.estado, r.clase, r.etiqueta, r.enferma = "diagnostico", clase.id, clase.etiqueta, not clase.sana

    # 4. Mapa de calor de la clase ganadora
    if salida.cam is not None:
        r.mapa_calor_png_base64 = mapa_calor.png_base64(salida.cam[mejor], *imagen.size)
        _paso(r, "mapa_calor", "¿Dónde miró?",
              "Las zonas rojas son las que más pesaron en la decisión", reloj.vuelta())
    return r
