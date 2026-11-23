"""Diagnóstico completo: router → especialista → calibración → mapa de calor.

Cada etapa queda registrada en `pasos` para que la web muestre "cómo piensa la IA".
"""
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from app.core.config import ajustes
from app.ia import mapa_calor
from app.ia.modelo import promedio, softmax
from app.ia.registro import Registro
from app.ia.segmentacion import Segmentacion, Segmentador, apta_para, huecos_mordedura
from app.ia.verificador import cargar as cargar_verificador
from pathlib import Path

_HILOS: ThreadPoolExecutor | None = None


def _obtener_hilos() -> ThreadPoolExecutor:
    global _HILOS
    limite = max(1, ajustes().inferencias_simultaneas)
    if _HILOS is None or getattr(_HILOS, "_max_workers", None) != limite:
        if _HILOS is not None:
            _HILOS.shutdown(wait=False)
        _HILOS = ThreadPoolExecutor(max_workers=limite, thread_name_prefix="segmentacion")
    return _HILOS


# La segmentación corre en paralelo con el router y el especialista (ONNX libera el GIL).
ESPERA_MAXIMA_S = 2.0  # si se demora más, se sigue sin ella
# Si menos de esta parte de la atención del modelo cae dentro de la máscara, la máscara probablemente
# marcó otro objeto (por ejemplo una hoja en vez de la mazorca): se muestra el mapa completo, como antes.
ATENCION_MIN_DENTRO = 0.4
_POR_DEFECTO = object()
# Si la confianza queda por debajo de esto, el modelo mira también la foto volteada arriba-abajo y se
# promedian ambas (el espejo izquierda-derecha ya va dentro de cada ONNX). Solo ~1 de cada 5 fotos lo
# necesita, así que en promedio suma ~40 ms. Medido en pruebas/volteo (README ahí). VOLTEO=false lo apaga.
LIMITE_VOLTEO = 0.7

# Reglas para maíz: ambigüedad entre cogollero y tizón de la hoja, y daño por mordedura
MARGEN_AMBIGUEDAD_MAIZ = 0.15
PAR_CONFLICTO_MAIZ = ("maiz_gusano_cogollero", "maiz_tizon_hoja")
MOTIVO_MAIZ_AMBIGUO = "Puede ser gusano cogollero o tizon: revisa si hay huecos o aserrin en la hoja."
MOTIVO_HUECOS_MAIZ = "Se detectaron varios huecos de mordedura en la hoja."

NOMBRES_CULTIVO = {"pimiento": "pimiento", "papa": "papa", "tomate": "tomate", "cafe": "café", "cacao": "cacao",
                   "maiz": "maíz", "limon": "limón", "naranja": "naranja"}
_VOLTEO = "; como dudaba, revisó también la foto de cabeza"
MOTIVO_NO_PLANTA = "Esto no parece una planta. Toma una foto de cerca de una hoja, fruto o mazorca."
MOTIVO_OTRA_PLANTA = "Es una planta, pero no es de los cultivos que FitoLens analiza: cafe, cacao, maiz, papa, tomate, pimiento, limon y naranja."
MOTIVO_OOD = MOTIVO_OTRA_PLANTA
MOTIVO_NO_CONCLUYENTE = "No estoy seguro. Toma otra foto más cerca y con buena luz."
MOTIVOS = {
    "no_planta": MOTIVO_NO_PLANTA,
    "otra_planta": MOTIVO_OTRA_PLANTA,
    "router_duda": "No se pudo reconocer el cultivo con seguridad. Prueba con una foto más cercana y nítida.",
    "sin_especialista": "Todavía no hay un modelo instalado para este cultivo.",
    "especialista_duda": MOTIVO_NO_CONCLUYENTE,
    "maiz_ambiguo": MOTIVO_MAIZ_AMBIGUO,
    "ood": MOTIVO_OTRA_PLANTA,
}


def logsumexp(logits: np.ndarray) -> float:
    m = float(np.max(logits))
    return float(m + np.log(np.sum(np.exp(logits - m))))


def energia(logits: np.ndarray) -> float:
    return -logsumexp(logits)


def entropia_normalizada(p: np.ndarray) -> float:
    k = len(p)
    if k <= 1:
        return 0.0
    p_pos = p[p > 0]
    h = -float(np.sum(p_pos * np.log(p_pos)))
    return float(h / np.log(k))


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
    motivo_codigo: str | None = None
    prob_cultivos: float | None = None
    prob_otra: float | None = None
    prob_no_planta: float | None = None
    prob_verificador: float | None = None  # prob. de cultivo soportado según el verificador abierto (CLIP)
    energia: float | None = None


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


def diagnosticar(registro: Registro, imagen: Image.Image, segmentador=_POR_DEFECTO, regla_huecos: bool = True) -> Resultado:
    """segmentador: por defecto el del registro; None la desactiva (útil para comparar)."""
    # Reduce a la resolución máxima de modelos y segmentación (512 px) si no venía reducida
    if max(imagen.size) > 512:
        imagen = imagen.copy()
        imagen.thumbnail((512, 512), Image.BILINEAR)
    reloj = _Cronometro()
    seg = registro.segmentador if segmentador is _POR_DEFECTO else segmentador
    tarea = _obtener_hilos().submit(_segmentar_medido, seg, imagen) if seg is not None else None
    try:
        return _diagnosticar(registro, imagen, reloj, tarea, regla_huecos=regla_huecos)
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


def _diagnosticar(registro: Registro, imagen: Image.Image, reloj: _Cronometro, tarea, regla_huecos: bool = True) -> Resultado:
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

    try:
        cfg = ajustes()
    except Exception:  # sin variables de entorno (scripts y pruebas sueltas): umbrales por defecto
        from app.core.config import Ajustes
        cfg = Ajustes.model_construct()
    rechazo_ids = set(m.rechazo) if m.rechazo else {"otra_planta", "no_planta"}
    p_no_planta = float(p[m.ids.index("no_planta")]) if "no_planta" in m.ids else 0.0
    p_otra = float(p[m.ids.index("otra_planta")]) if "otra_planta" in m.ids else 0.0
    prob_cultivos = float(sum(p[k] for k, c in enumerate(m.clases) if c.id not in rechazo_ids))
    energia_r = float(energia(logits))

    r.prob_cultivos = round(prob_cultivos, 4)
    r.prob_otra = round(p_otra, 4)
    r.prob_no_planta = round(p_no_planta, 4)
    r.energia = round(energia_r, 4)

    # PASO 1 '¿es una planta?': si p(no_planta) es la mayor o p(no_planta) > p(otra_planta) y la suma de cultivos < 0.70
    if cultivo == "no_planta" or (p_no_planta > p_otra and prob_cultivos < cfg.ood_min_cultivos):
        r.estado = "rechazada"
        r.motivo_codigo = "no_planta"
        r.motivo = MOTIVO_NO_PLANTA
        return r

    # PASO 2 '¿es un cultivo que analizo?': si la ganadora es otra_planta o la suma de cultivos soportados < 0.70
    if cultivo == "otra_planta" or prob_cultivos < cfg.ood_min_cultivos:
        r.estado = "rechazada"
        r.motivo_codigo = "otra_planta"
        r.motivo = MOTIVO_OTRA_PLANTA
        return r

    # PASO 2b: verificador abierto (CLIP). El router puede estar muy seguro ante plantas que nunca vio (coco, palma...).
    if cfg.verificador_umbral is not None:
        ver = cargar_verificador(Path(cfg.modelos_dir) / "verificador")
        if ver is not None:
            try:
                p_clip = ver.prob_cultivo(imagen)
            except Exception:
                p_clip = None
            if p_clip is not None:
                r.prob_verificador = round(p_clip, 4)
                if p_clip < cfg.verificador_umbral:
                    r.estado = "rechazada"
                    r.motivo_codigo = "otra_planta"
                    r.motivo = MOTIVO_OTRA_PLANTA
                    return r

    # Reglas de energía en router (desactivadas por defecto)
    if cfg.ood_umbral_energia_router is not None and energia_r > cfg.ood_umbral_energia_router:
        r.estado = "rechazada"
        if p_no_planta > p_otra:
            r.motivo_codigo = "no_planta"
            r.motivo = MOTIVO_NO_PLANTA
        else:
            r.motivo_codigo = "otra_planta"
            r.motivo = MOTIVO_OTRA_PLANTA
        return r

    if conf < m.umbral:
        r.estado, r.motivo_codigo, r.motivo = "no_concluyente", "no_concluyente", MOTIVOS["router_duda"]
        return r
    r.cultivo = cultivo

    # 2. Especialista del cultivo
    esp = registro.especialista(cultivo)
    if esp is None:
        r.estado, r.motivo_codigo, r.motivo = "no_concluyente", "no_concluyente", MOTIVOS["sin_especialista"]
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

    # Energía OOD del especialista (logits antes de temperatura)
    energia_esp = energia(salida.logits)
    if cfg.ood_umbral_energia_especialista is not None and energia_esp > cfg.ood_umbral_energia_especialista:
        r.estado = "rechazada"
        r.cultivo = None
        r.clase = None
        r.etiqueta = None
        r.confianza = None
        r.enferma = False
        r.top3 = []
        r.motivo_codigo = "otra_planta"
        r.motivo = MOTIVO_OTRA_PLANTA
        return r

    _paso(r, "especialista", f"Modelo de {NOMBRES_CULTIVO.get(cultivo, cultivo)}",
          f"Compara la foto con {len(indices)} condiciones que conoce" + (_VOLTEO if volteo else ""),
          reloj.vuelta())

    # 3. Calibración y umbral
    orden = np.argsort(p)[::-1]
    r.top3 = [{"clase": em.clases[indices[k]].id, "etiqueta": em.clases[indices[k]].etiqueta,
               "confianza": round(min(conf * float(p[k]), 0.99), 4)} for k in orden[:3]]
    mejor = indices[orden[0]]
    clase = em.clases[mejor]
    r.confianza = round(min(conf * float(p[orden[0]]), 0.99), 4)
    _paso(r, "calibracion", "¿Qué tan segura está?",
          f"Confianza calibrada {r.confianza:.0%}; mínimo exigido {em.umbral:.0%}", reloj.vuelta())
    if r.confianza < em.umbral:
        r.estado, r.motivo_codigo, r.motivo = "no_concluyente", "no_concluyente", MOTIVOS["especialista_duda"]
    else:
        r.estado, r.clase, r.etiqueta, r.enferma = "diagnostico", clase.id, clase.etiqueta, not clase.sana

    # Regla de ambigüedad para maíz (probabilidades): si la clase ganadora es tizón o cogollero,
    # y la otra tiene probabilidad >= 0.15 o la diferencia es < 0.15, se marca como no concluyente.
    if r.estado == "diagnostico" and cultivo == "maiz" and clase.id in PAR_CONFLICTO_MAIZ:
        otra_id = "maiz_gusano_cogollero" if clase.id == "maiz_tizon_hoja" else "maiz_tizon_hoja"
        p_otra = 0.0
        for k, idx in enumerate(indices):
            if em.clases[idx].id == otra_id:
                p_otra = float(p[k])
                break
        if p_otra >= MARGEN_AMBIGUEDAD_MAIZ or abs(r.confianza - p_otra) < MARGEN_AMBIGUEDAD_MAIZ:
            r.estado, r.clase, r.etiqueta, r.enferma = "no_concluyente", None, None, False
            r.motivo_codigo, r.motivo = "no_concluyente", MOTIVOS["maiz_ambiguo"]

    # 4. Dónde está la hoja (calculado en paralelo)
    hoja = _hoja(r, tarea, reloj)
    # Detección de daño por mordedura (huecos de gusano cogollero) para maíz:
    if regla_huecos and cultivo == "maiz" and clase.id in PAR_CONFLICTO_MAIZ and hoja is not None and hoja.mascara is not None:
        mordedura = huecos_mordedura(hoja.mascara, imagen=imagen)
        if mordedura["fuerte"]:
            idx_cogollero = next((idx for idx in indices if em.clases[idx].id == "maiz_gusano_cogollero"), None)
            p_cogollero = 0.0
            if idx_cogollero is not None and idx_cogollero in indices:
                p_cogollero = float(p[indices.index(idx_cogollero)])
            clase_cogollero = em.clases[idx_cogollero] if idx_cogollero is not None else clase
            r.estado = "diagnostico"
            r.clase = "maiz_gusano_cogollero"
            r.etiqueta = clase_cogollero.etiqueta
            r.enferma = not clase_cogollero.sana
            r.confianza = round(min(max(conf * p_cogollero, 0.6), 0.99), 4)
            r.motivo = MOTIVO_HUECOS_MAIZ
            if idx_cogollero is not None:
                mejor = idx_cogollero

    cam_mejor = salida.cam[mejor] if salida.cam is not None else None
    del salida  # libera de inmediato el mapa de activación de las demás clases

    if hoja is not None and not apta_para(hoja, cultivo):
        hoja = None
        r.pasos[-1]["detalle"] = "La forma ubicada no parece una sola mazorca; se usa la foto completa"
    if hoja is not None and cam_mejor is not None:
        if mapa_calor.fraccion_dentro(cam_mejor, hoja.mascara) < ATENCION_MIN_DENTRO:
            hoja = None
            r.pasos[-1]["detalle"] = "La IA miró sobre todo fuera de la zona ubicada; se muestra la foto completa"
    if hoja is not None:
        r.mascara_ok, r.contorno_hoja = True, hoja.contorno

    # 5. Mapa de calor de la clase ganadora (solo sobre la hoja si se ubicó)
    if cam_mejor is not None:
        r.mapa_calor_png_base64 = mapa_calor.png_base64(
            cam_mejor, *imagen.size, mascara=hoja.mascara if hoja else None)
        _paso(r, "mapa_calor", "¿Dónde miró?",
              "Las zonas rojas son las que más pesaron en la decisión", reloj.vuelta())
    del cam_mejor, hoja
    if r.confianza is not None:
        r.confianza = min(r.confianza, 0.99)
    return r
