"""Diagnóstico completo: router → especialista → calibración → mapa de calor.

Cada etapa queda registrada en `pasos` para que la web muestre "cómo piensa la IA".
"""
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from app.ia import mapa_calor
from app.ia.modelo import promedio, softmax
from app.ia.registro import Registro
from app.ia.segmentacion import Segmentacion, Segmentador, apta_para

# La segmentación corre en paralelo con el router y el especialista (ONNX libera el GIL).
_HILOS = ThreadPoolExecutor(max_workers=4, thread_name_prefix="segmentacion")
ESPERA_MAXIMA_S = 2.0  # si se demora más, se sigue sin ella
# Si menos de esta parte de la atención del modelo cae dentro de la máscara, la máscara probablemente
# marcó otro objeto (por ejemplo una hoja en vez de la mazorca): se muestra el mapa completo, como antes.
ATENCION_MIN_DENTRO = 0.4
_POR_DEFECTO = object()
# Si la confianza queda por debajo de esto, el modelo mira también la foto volteada arriba-abajo y se
# promedian ambas (el espejo izquierda-derecha ya va dentro de cada ONNX). Solo ~1 de cada 5 fotos lo
# necesita, así que en promedio suma ~40 ms. Medido en pruebas/volteo (README ahí). VOLTEO=false lo apaga.
LIMITE_VOLTEO = 0.7

NOMBRES_CULTIVO = {"pimiento": "pimiento", "papa": "papa", "tomate": "tomate", "cafe": "café", "cacao": "cacao"}
_VOLTEO = "; como dudaba, revisó también la foto de cabeza"
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
    mascara_ok: bool = False
    contorno_hoja: list = field(default_factory=list)
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


def _segmentar_medido(seg: Segmentador, imagen: Image.Image) -> tuple[Segmentacion, int]:
    inicio = time.perf_counter()
    r = seg.segmentar(imagen)
    return r, round((time.perf_counter() - inicio) * 1000)


def diagnosticar(registro: Registro, imagen: Image.Image, segmentador=_POR_DEFECTO) -> Resultado:
    """segmentador: por defecto el del registro; None la desactiva (útil para comparar)."""
    reloj = _Cronometro()
    seg = registro.segmentador if segmentador is _POR_DEFECTO else segmentador
    tarea = _HILOS.submit(_segmentar_medido, seg, imagen) if seg is not None else None
    try:
        return _diagnosticar(registro, imagen, reloj, tarea)
    finally:
        if tarea is not None:
            tarea.cancel()  # si la foto se rechazó antes, no hace falta esperarla


def _hoja(r: Resultado, tarea, reloj: _Cronometro) -> Segmentacion | None:
    """Recoge la segmentación lanzada en paralelo. Cualquier problema = None (foto completa, como antes)."""
    if tarea is None:
        return None
    try:
        seg, ms = tarea.result(timeout=ESPERA_MAXIMA_S)
    except Exception:
        seg, ms = None, round(ESPERA_MAXIMA_S * 1000)
    reloj.vuelta()
    if seg is not None and seg.ok:
        detalle = f"Ubicó la planta: ocupa el {seg.cobertura:.0%} de la foto"
    else:
        detalle = "No se pudo separar la planta del fondo con seguridad; se usa la foto completa"
    _paso(r, "segmentacion", "¿Dónde está la hoja?", detalle, ms)
    return seg if seg is not None and seg.ok else None


def _diagnosticar(registro: Registro, imagen: Image.Image, reloj: _Cronometro, tarea) -> Resultado:
    router = registro.router
    r = Resultado(estado="rechazada", modelo_version=router.version)

    # 1. Router: ¿qué cultivo es?
    m = router.manifest
    logits = router.predecir(imagen).logits
    p = softmax(logits, m.temperatura)
    volteo = registro.volteo and p.max() < LIMITE_VOLTEO
    if volteo:
        p = softmax((logits + router.predecir(imagen, volteada=True).logits) / 2, m.temperatura)
    i = int(np.argmax(p))
    cultivo, conf = m.ids[i], float(p[i])
    _paso(r, "router", "¿Qué planta es?",
          f"{m.clases[i].etiqueta} con {conf:.0%} de confianza" + (_VOLTEO if volteo else ""), reloj.vuelta())
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
    p = softmax(salida.logits[indices], em.temperatura)
    volteo = registro.volteo and p.max() < LIMITE_VOLTEO
    if volteo:
        salida = promedio(salida, esp.predecir(imagen, volteada=True))
        p = softmax(salida.logits[indices], em.temperatura)
    _paso(r, "especialista", f"Modelo de {NOMBRES_CULTIVO.get(cultivo, cultivo)}",
          f"Compara la foto con {len(indices)} condiciones que conoce" + (_VOLTEO if volteo else ""),
          reloj.vuelta())

    # 3. Calibración y umbral
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

    # 4. Dónde está la hoja (calculado en paralelo; solo para mostrar, no cambia el diagnóstico)
    hoja = _hoja(r, tarea, reloj)
    if hoja is not None and not apta_para(hoja, cultivo):
        hoja = None
        r.pasos[-1]["detalle"] = "La forma ubicada no parece una sola mazorca; se usa la foto completa"
    if hoja is not None and salida.cam is not None:
        if mapa_calor.fraccion_dentro(salida.cam[mejor], hoja.mascara) < ATENCION_MIN_DENTRO:
            hoja = None
            r.pasos[-1]["detalle"] = "La IA miró sobre todo fuera de la zona ubicada; se muestra la foto completa"
    if hoja is not None:
        r.mascara_ok, r.contorno_hoja = True, hoja.contorno

    # 5. Mapa de calor de la clase ganadora (solo sobre la hoja si se ubicó)
    if salida.cam is not None:
        r.mapa_calor_png_base64 = mapa_calor.png_base64(
            salida.cam[mejor], *imagen.size, mascara=hoja.mascara if hoja else None)
        _paso(r, "mapa_calor", "¿Dónde miró?",
              "Las zonas rojas son las que más pesaron en la decisión", reloj.vuelta())
    return r
