"""Ubica la hoja, el fruto o la mazorca en la foto (máscara y contorno) antes de mostrar el mapa de calor.

Modelo: U2-Net-p (detección del objeto principal de la foto, 4.6 MB, licencia Apache 2.0), exportado a ONNX
por el proyecto rembg y fijado a 192 px. Corre en CPU en ~60-100 ms con 2 hilos, y en el pipeline se ejecuta
en paralelo con el router y el especialista, así que casi no suma tiempo.

Se usa SOLO para mostrar (contorno) y para recortar el mapa de calor. El router y los especialistas siguen
recibiendo la foto completa, como fueron entrenados: la segmentación no puede cambiar un diagnóstico.

A prueba de fallos: si el modelo falta, falla, o la máscara sale vacía, diminuta, casi toda la foto o dudosa,
`ok` es False y todo funciona como antes (foto completa, mapa de calor sin recortar).
"""
import hashlib
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image
from scipy import ndimage
from scipy.spatial import ConvexHull

log = logging.getLogger("fitolens.segmentacion")

RUTA_MODELO = Path(__file__).parent / "recursos" / "u2netp_192.onnx"
SHA256 = "c18d0045d871dafa1b184ff097158163363890c3290f6e975fb476bf9579a9ce"
LADO = 192
_MEDIA = np.array([0.485, 0.456, 0.406], np.float32)
_DESVIO = np.array([0.229, 0.224, 0.225], np.float32)

# Reglas de confianza (calibradas con pruebas/segmentacion: 87 fotos con referencia)
COBERTURA_MIN = 0.02  # la hoja ocupa al menos 2 % de la foto
COBERTURA_MAX = 0.95  # si "todo es hoja", no hay nada que separar
CONFIANZA_MIN = 0.66  # nitidez del objeto y su borde (0 = todo dudoso, 1 = bordes netos)
NUCLEO_MIN = 0.75  # parte del objeto marcada con seguridad alta (p > 0.8)
COBERTURA_GRANDE = 0.75  # objeto que llena casi toda la foto: se exige más nitidez
CONFIANZA_GRANDE = 0.90
# Una mazorca es convexa: si la forma tiene entrantes grandes, se pegó el tronco u otra mazorca.
SOLIDEZ_MIN = {"cacao": 0.75}
MAX_POLIGONOS = 5
MAX_PUNTOS = 120


@dataclass
class Segmentacion:
    ok: bool
    mascara: np.ndarray | None = None  # bool [LADO, LADO], estirada al encuadre completo de la foto
    cobertura: float = 0.0
    confianza: float = 0.0
    nucleo: float = 0.0
    solidez: float = 0.0  # área / área de su envolvente convexa (la peor de las regiones); 1 = convexa
    contorno: list[list[list[float]]] = field(default_factory=list)  # polígonos de [x, y] en 0-1
    motivo: str | None = None
    fraccion_huecos: float = 0.0


def _fallo(motivo: str, **datos) -> Segmentacion:
    return Segmentacion(ok=False, motivo=motivo, **datos)


def fraccion_huecos_internos(mascara: np.ndarray | None) -> float:
    """Calcula la fracción de huecos internos (fondo encerrado) respecto al área de la hoja."""
    if mascara is None or not mascara.any():
        return 0.0
    llena = ndimage.binary_fill_holes(mascara)
    huecos = llena & (~mascara)
    area_llena = float(llena.sum())
    return float(huecos.sum()) / area_llena if area_llena > 0 else 0.0


class Segmentador:
    def __init__(self, ruta: Path = RUTA_MODELO, hilos: int = 2):
        datos = ruta.read_bytes()
        if hashlib.sha256(datos).hexdigest() != SHA256:
            raise ValueError(f"{ruta.name}: el SHA-256 no coincide")
        opciones = ort.SessionOptions()
        opciones.intra_op_num_threads = hilos
        opciones.inter_op_num_threads = 1
        self.sesion = ort.InferenceSession(datos, opciones, providers=["CPUExecutionProvider"])
        self.entrada = self.sesion.get_inputs()[0].name
        self.salida = self.sesion.get_outputs()[0].name

    @classmethod
    def cargar(cls, hilos: int = 2, ruta: Path = RUTA_MODELO) -> "Segmentador | None":
        """Carga y calienta. Devuelve None si no se puede: el diagnóstico sigue sin segmentación."""
        try:
            seg = cls(ruta, hilos)
            inicio = time.perf_counter()
            seg.probabilidad(Image.new("RGB", (LADO, LADO), (60, 140, 60)))
            log.info("Segmentador cargado (calentamiento %s ms)", round((time.perf_counter() - inicio) * 1000))
            return seg
        except Exception as e:
            log.error("Segmentación desactivada: %s", e)
            return None

    def probabilidad(self, imagen: Image.Image) -> np.ndarray:
        # Fotos de 12 MP: primero se reduce por un factor entero (rápido), luego se lleva a 192 px.
        factor = min(imagen.size) // (2 * LADO)
        if factor >= 2:
            imagen = imagen.reduce(factor)
        x = np.asarray(imagen.convert("RGB").resize((LADO, LADO), Image.BILINEAR), np.float32) / 255.0
        x = ((x - _MEDIA) / _DESVIO).transpose(2, 0, 1)[None]
        p = self.sesion.run([self.salida], {self.entrada: x})[0][0, 0]
        return np.nan_to_num(p.astype(np.float32), nan=0.0).clip(0, 1)

    def segmentar(self, imagen: Image.Image) -> Segmentacion:
        try:
            return analizar(self.probabilidad(imagen))
        except Exception as e:  # nunca rompe un diagnóstico
            log.exception("Fallo en la segmentación")
            return _fallo(f"error: {e}")


def analizar(p: np.ndarray) -> Segmentacion:
    """De la probabilidad por píxel a máscara limpia, métricas de confianza y contorno."""
    m = ndimage.gaussian_filter(p, 1.0) > 0.5  # suaviza el borde antes de cortar
    etiquetas, n = ndimage.label(m, structure=np.ones((3, 3)))
    if n == 0:
        return _fallo("vacia")
    areas = ndimage.sum_labels(m, etiquetas, index=np.arange(1, n + 1))
    orden = np.argsort(areas)[::-1]
    minimo = max(0.15 * areas[orden[0]], 0.005 * m.size)  # descarta motas sueltas
    elegidas = [int(k) + 1 for k in orden[:MAX_POLIGONOS] if areas[k] >= minimo]
    m = np.isin(etiquetas, elegidas)  # conserva huecos internos de daño o mordedura
    llena = ndimage.binary_fill_holes(m)
    huecos = llena & (~m)
    area_llena = float(llena.sum())
    fraccion_huecos = float(huecos.sum()) / area_llena if area_llena > 0 else 0.0

    cobertura = float(m.mean())
    # Nitidez: en una máscara confiable casi todos los píxeles del objeto y de una franja alrededor están cerca
    # de 0 o de 1. Se mide solo ahí: una bruma tenue lejos del objeto (tronco, follaje) no lo vuelve dudoso.
    zona = ndimage.binary_dilation(llena, iterations=6)
    confianza = float(np.abs(2 * p[zona] - 1).mean())
    nucleo = float((p[m] > 0.8).mean()) if m.any() else 0.0
    datos = dict(mascara=m, cobertura=round(cobertura, 4), confianza=round(confianza, 4), nucleo=round(nucleo, 4),
                 fraccion_huecos=round(fraccion_huecos, 4))
    if cobertura < COBERTURA_MIN:
        return _fallo("muy_pequena", **datos)
    if cobertura > COBERTURA_MAX:
        return _fallo("toda_la_foto", **datos)
    if confianza < CONFIANZA_MIN or nucleo < NUCLEO_MIN:
        return _fallo("dudosa", **datos)
    if cobertura > COBERTURA_GRANDE and confianza < CONFIANZA_GRANDE:
        return _fallo("dudosa", **datos)

    contorno = [c for c in (_contorno(etiquetas == e) for e in elegidas) if len(c) >= 3]
    if not contorno:
        return _fallo("sin_contorno", **datos)
    return Segmentacion(ok=True, contorno=contorno, solidez=round(min(map(_solidez, contorno)), 4), **datos)


def apta_para(seg: Segmentacion, cultivo: str | None) -> bool:
    """Reglas que dependen del cultivo (se conoce después del router)."""
    return seg.ok and seg.solidez >= SOLIDEZ_MIN.get(cultivo, 0.0)


def _solidez(poligono: list[list[float]]) -> float:
    pts = np.array(poligono)
    if len(pts) < 3:
        return 0.0
    x, y = pts.T
    area = 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
    try:
        return float(area / ConvexHull(pts).volume)
    except Exception:  # puntos alineados
        return 0.0


# Vecinos en sentido horario empezando por el oeste (x, y)
_VECINOS = [(-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1)]


def _contorno(region: np.ndarray) -> list[list[float]]:
    """Borde exterior de una región (Moore), simplificado y normalizado a 0-1."""
    region = ndimage.binary_fill_holes(region)
    alto, ancho = region.shape
    r = np.pad(region, 1)
    ys, xs = np.nonzero(r)
    if len(ys) == 0:
        return []
    k = np.lexsort((xs, ys))[0]  # primer píxel en orden de lectura: su vecino oeste es fondo
    inicio = (int(xs[k]), int(ys[k]))
    puntos, actual, direccion = [inicio], inicio, 0
    for _ in range(4 * r.size):
        for i in range(8):
            d = (direccion + i) % 8
            x, y = actual[0] + _VECINOS[d][0], actual[1] + _VECINOS[d][1]
            if r[y, x]:
                actual = (x, y)
                direccion = (d + 5) % 8  # retroceder y seguir girando en sentido horario
                break
        else:
            break  # píxel aislado
        if actual == inicio:
            break
        puntos.append(actual)
    pts = np.array(puntos, np.float64) - 1 + 0.5  # quitar el relleno, centro del píxel
    pts = _simplificar(pts, tolerancia=0.6)
    tol = 0.6
    while len(pts) > MAX_PUNTOS:
        tol *= 1.5
        pts = _simplificar(pts, tol)
    pts[:, 0] /= ancho
    pts[:, 1] /= alto
    return np.round(pts.clip(0, 1), 4).tolist()


def _simplificar(pts: np.ndarray, tolerancia: float) -> np.ndarray:
    """Douglas-Peucker iterativo."""
    if len(pts) < 4:
        return pts
    conservar = np.zeros(len(pts), bool)
    conservar[0] = conservar[-1] = True
    pila = [(0, len(pts) - 1)]
    while pila:
        a, b = pila.pop()
        if b - a < 2:
            continue
        seg = pts[b] - pts[a]
        largo = np.hypot(*seg)
        rel = pts[a + 1:b] - pts[a]
        dist = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / largo if largo > 0 else np.hypot(rel[:, 0], rel[:, 1])
        i = int(np.argmax(dist))
        if dist[i] > tolerancia:
            conservar[a + 1 + i] = True
            pila += [(a, a + 1 + i), (a + 1 + i, b)]
    return pts[conservar]


_global: Segmentador | None = None


def segmentar(imagen: Image.Image) -> Segmentacion:
    """Atajo con una instancia compartida (pruebas y scripts)."""
    global _global
    if _global is None:
        _global = Segmentador.cargar()
    return _global.segmentar(imagen) if _global else _fallo("sin_modelo")
