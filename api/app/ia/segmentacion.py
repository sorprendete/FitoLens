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


# Umbrales para detección de huecos de gusano cogollero en maíz
LADO_HUECOS = 512                 # Resolución de análisis para detección de huecos por color
UMBRAL_HUECO_RUIDO_FRAC = 0.0004  # Descarta componentes < 0.04 % del área de la hoja
UMBRAL_HUECO_ASPECTO_MAX = 6.0    # Descarta componentes alargados (relación de aspecto > 6)
UMBRAL_HUECO_SOLIDEZ_MIN = 0.4    # Descarta componentes no convexos / hendiduras (solidez < 0.4)
UMBRAL_HUECO_BORDE_PCT = 0.02     # Margen del contorno exterior (2 % del lado de la imagen)

# Condiciones de mordedura fuerte:
# al menos 4 huecos y 0.8 % del área, o al menos 2 huecos y 3 % del área
HUECOS_FUERTE_MIN_CANTIDAD = 4
HUECOS_FUERTE_MIN_FRACCION = 0.008
HUECOS_FUERTE_MODERADO_CANTIDAD = 2
HUECOS_FUERTE_MODERADO_FRACCION = 0.03
HUECOS_FUERTE_GRANDE_CANTIDAD = HUECOS_FUERTE_MODERADO_CANTIDAD
HUECOS_FUERTE_GRANDE_FRACCION = HUECOS_FUERTE_MODERADO_FRACCION


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


def _rgb_a_lab(rgb: np.ndarray) -> np.ndarray:
    """Convierte RGB en [0, 1] a CIELAB D65 [L*(0-100), a*(-128..127), b*(-128..127)]."""
    rgb = np.clip(rgb, 0.0, 1.0)
    mask = rgb > 0.04045
    lineal = np.where(mask, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    r, g, b = lineal[..., 0], lineal[..., 1], lineal[..., 2]
    x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
    y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750)
    z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883
    delta = 6.0 / 29.0
    delta3 = delta ** 3
    fx = np.where(x > delta3, np.cbrt(x), (x / (3.0 * delta * delta)) + (4.0 / 29.0))
    fy = np.where(y > delta3, np.cbrt(y), (y / (3.0 * delta * delta)) + (4.0 / 29.0))
    fz = np.where(z > delta3, np.cbrt(z), (z / (3.0 * delta * delta)) + (4.0 / 29.0))
    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b_val = 200.0 * (fy - fz)
    return np.stack([L, a, b_val], axis=-1)


def _rgb_a_hsv(rgb: np.ndarray) -> np.ndarray:
    """Convierte RGB en [0, 1] a HSV [H(0-360), S(0-1), V(0-1)]."""
    rgb = np.clip(rgb, 0.0, 1.0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    df = mx - mn
    h = np.zeros_like(mx)
    mask_r = (mx == r) & (df > 1e-6)
    mask_g = (mx == g) & (df > 1e-6)
    mask_b = (mx == b) & (df > 1e-6)
    h[mask_r] = (60.0 * ((g[mask_r] - b[mask_r]) / df[mask_r]) + 360.0) % 360.0
    h[mask_g] = 60.0 * ((b[mask_g] - r[mask_g]) / df[mask_g]) + 120.0
    h[mask_b] = 60.0 * ((r[mask_b] - g[mask_b]) / df[mask_b]) + 240.0
    s = np.where(mx > 1e-6, df / mx, 0.0)
    return np.stack([h, s, mx], axis=-1)


def _es_tejido_hoja(rgb: np.ndarray, hsv: np.ndarray) -> np.ndarray:
    """Detecta píxeles de tejido vegetal (hoja verde, nervadura clara o lesiones de tizón marrón saturado)."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    es_verde = (
        ((h >= 55.0) & (h <= 175.0) & (s >= 0.12) & (v >= 0.10)) |
        ((g >= r * 0.95) & (g >= b * 1.02) & (g >= 0.12))
    )
    es_nervadura = (
        ((h >= 40.0) & (h < 55.0) & (s >= 0.10) & (v >= 0.30)) |
        ((g >= r * 0.90) & (g >= b * 0.95) & (v >= 0.50))
    )
    es_necrotico = (
        (h >= 15.0) & (h <= 45.0) &
        (s >= 0.40) &
        (r > g) &
        ((r - b) >= 0.15) &
        (v >= 0.15) & (v <= 0.75)
    )
    return es_verde | es_nervadura | es_necrotico


def huecos_mordedura(
    mascara: np.ndarray | None,
    imagen: Image.Image | np.ndarray | None = None,
    depuracion: bool = False,
) -> dict:
    """Detecta huecos de mordedura de gusano cogollero en la hoja, sin falsos positivos.

    Devuelve dict con:
      - cantidad (int): número de huecos válidos que superaron todos los filtros
      - fraccion (float): área total de huecos válidos / área de la hoja
      - fuerte (bool): True si (cantidad >= 3 y fraccion >= 0.02) o (cantidad >= 1 y fraccion >= 0.06)
      - silueta (np.ndarray, opcional si depuracion=True): máscara de silueta (512, 512)
      - mascara_huecos (np.ndarray, opcional si depuracion=True): máscara booleana de huecos válidos (512, 512)
    """
    res_vacio = {"cantidad": 0, "fraccion": 0.0, "fuerte": False}
    if depuracion:
        res_vacio.update({"silueta": None, "mascara_huecos": None})
    if mascara is None:
        return res_vacio
    m = np.asarray(mascara, dtype=bool)
    if m.ndim != 2 or not m.any():
        return res_vacio

    # Si no se pasa imagen, se evalúan únicamente los huecos geométricos de la máscara original
    if imagen is None:
        llena = ndimage.binary_fill_holes(m)
        area_hoja = float(llena.sum())
        if area_hoja <= 0:
            return res_vacio
        huecos_raw = llena & (~m)
        lado = max(m.shape)
        silueta_eval = llena
    else:
        # 1. Silueta de la hoja a resolución mayor (~512 px)
        lado = LADO_HUECOS
        llena_orig = ndimage.binary_fill_holes(m)
        if not llena_orig.any():
            return res_vacio

        sil_img = Image.fromarray((llena_orig * 255).astype(np.uint8)).resize((lado, lado), Image.NEAREST)
        silueta = ndimage.binary_fill_holes(np.asarray(sil_img) > 127)
        area_hoja = float(silueta.sum())
        if area_hoja < 100:
            return res_vacio

        # Imagen a 512 px y normalizada a [0, 1]
        if isinstance(imagen, Image.Image):
            img_512 = imagen.convert("RGB").resize((lado, lado), Image.BILINEAR)
            rgb = np.asarray(img_512, dtype=np.float32) / 255.0
        else:
            arr = np.asarray(imagen)
            if arr.shape[:2] != (lado, lado):
                img_pil = Image.fromarray(arr.astype(np.uint8)).convert("RGB").resize((lado, lado), Image.BILINEAR)
                rgb = np.asarray(img_pil, dtype=np.float32) / 255.0
            else:
                rgb = arr.astype(np.float32)
                if rgb.max() > 1.0:
                    rgb /= 255.0

        # 2. Conversión de color (Lab y HSV) y clasificación de tejido
        lab = _rgb_a_lab(rgb)
        hsv = _rgb_a_hsv(rgb)
        es_tejido = _es_tejido_hoja(rgb, hsv)
        es_verde_mask = (
            ((hsv[..., 0] >= 55.0) & (hsv[..., 0] <= 175.0) & (hsv[..., 1] >= 0.12) & (hsv[..., 2] >= 0.10)) |
            ((rgb[..., 1] >= rgb[..., 0] * 0.95) & (rgb[..., 1] >= rgb[..., 2] * 1.02) & (rgb[..., 1] >= 0.12))
        )

        # 3. Modelado robusto del color de la hoja con píxeles del interior (erosiona silueta)
        iter_erosion = max(3, int(round(0.025 * lado)))
        interior = ndimage.binary_erosion(silueta, iterations=iter_erosion)
        if interior.sum() < 200:
            interior = ndimage.binary_erosion(silueta, iterations=max(1, iter_erosion // 2))
        if interior.sum() < 50:
            interior = silueta

        pix_sel = interior & es_verde_mask
        if pix_sel.sum() < 200:
            pix_sel = interior & es_tejido
        if pix_sel.sum() < 100:
            pix_sel = interior
        if pix_sel.sum() < 50:
            pix_sel = silueta

        pixeles_lab = lab[pix_sel]
        med_l = float(np.median(pixeles_lab[:, 0]))
        med_a = float(np.median(pixeles_lab[:, 1]))
        med_b = float(np.median(pixeles_lab[:, 2]))

        mad_l = float(np.median(np.abs(pixeles_lab[:, 0] - med_l)))
        mad_a = float(np.median(np.abs(pixeles_lab[:, 1] - med_a)))
        mad_b = float(np.median(np.abs(pixeles_lab[:, 2] - med_b)))

        sig_l = max(1.4826 * mad_l, 4.0)
        sig_a = max(1.4826 * mad_a, 4.0)
        sig_b = max(1.4826 * mad_b, 4.0)

        # Candidatos por color dentro de la silueta:
        # (a) Claramente más oscuro que el tejido (L < med_L - 3*sig_L) o fuera del rango verde-amarillo con baja saturación
        es_oscuro = lab[..., 0] < (med_l - 3.0 * sig_l)
        h_vals = hsv[..., 0]
        s_vals = hsv[..., 1]
        fuera_verde_amarillo = (h_vals < 35.0) | (h_vals > 175.0)
        sat_baja = s_vals < 0.35
        candidatos_color = (es_oscuro | (fuera_verde_amarillo & sat_baja)) & (~es_tejido)
        huecos_color = silueta & candidatos_color

        # (b) Cierre y ligera dilatación morfológica (3x3) para recuperar el hueco completo
        struct_3x3 = np.ones((3, 3), dtype=bool)
        huecos_cerrados = ndimage.binary_closing(huecos_color, structure=struct_3x3)
        huecos_recuperados = ndimage.binary_dilation(huecos_cerrados, structure=struct_3x3, iterations=1) & silueta

        # Si la máscara original ya tenía huecos geométricos, incluirlos también
        geom_orig = llena_orig & (~m)
        if geom_orig.any():
            geom_img = Image.fromarray((geom_orig * 255).astype(np.uint8)).resize((lado, lado), Image.NEAREST)
            huecos_geom = np.asarray(geom_img) > 127
            huecos_raw = huecos_recuperados | huecos_geom
        else:
            huecos_raw = huecos_recuperados

        silueta_eval = silueta

    if not huecos_raw.any():
        return res_vacio

    # Limpieza morfológica: en modo solo geométrico se aplica apertura/cierre estándar
    if imagen is None:
        huecos_limpios = ndimage.binary_opening(huecos_raw, structure=np.ones((3, 3)))
        huecos_limpios = ndimage.binary_closing(huecos_limpios, structure=np.ones((3, 3)))
    else:
        huecos_limpios = huecos_raw

    # Dilatar el contorno exterior (2 % del lado) para descartar huecos pegados al borde
    radio_borde = max(1, int(round(UMBRAL_HUECO_BORDE_PCT * lado)))
    exterior = (~silueta_eval).copy()
    exterior[0, :] = True
    exterior[-1, :] = True
    exterior[:, 0] = True
    exterior[:, -1] = True
    zona_borde = ndimage.binary_dilation(exterior, iterations=radio_borde)

    etiquetas, n = ndimage.label(huecos_limpios, structure=np.ones((3, 3)))
    if n == 0:
        return res_vacio

    huecos_validos = []
    area_total = 0
    mascara_huecos_validos = np.zeros_like(silueta_eval, dtype=bool)

    for k in range(1, n + 1):
        comp = (etiquetas == k)
        area_comp = int(comp.sum())

        # 1. Ignorar componentes muy pequeños (ruido, < 0.04 % del área de la hoja)
        if area_comp < UMBRAL_HUECO_RUIDO_FRAC * area_hoja:
            continue

        # 2. Ignorar regiones pegadas al contorno exterior o al borde de la imagen
        if np.any(comp & zona_borde):
            continue

        # 3. Ignorar componentes muy alargados y delgados (relación de aspecto > 6)
        ys, xs = np.nonzero(comp)
        alto_bb = int(ys.max() - ys.min() + 1)
        ancho_bb = int(xs.max() - xs.min() + 1)
        relacion_aspecto = max(alto_bb, ancho_bb) / max(min(alto_bb, ancho_bb), 1)
        if relacion_aspecto > UMBRAL_HUECO_ASPECTO_MAX:
            continue

        # 3b. Descarta manchas alargadas de tizón (relación de aspecto > 3.5 con tono marrón claro)
        if relacion_aspecto > 3.5 and imagen is not None:
            comp_hsv = hsv[comp]
            comp_rgb = rgb[comp]
            comp_lab = lab[comp]
            h_med = float(np.median(comp_hsv[:, 0]))
            s_med = float(np.median(comp_hsv[:, 1]))
            l_med = float(np.median(comp_lab[:, 0]))
            r_med = float(np.median(comp_rgb[:, 0]))
            g_med = float(np.median(comp_rgb[:, 1]))
            b_med = float(np.median(comp_rgb[:, 2]))
            es_marron_claro = (
                (10.0 <= h_med <= 50.0) and
                (s_med >= 0.10) and
                (l_med >= 25.0) and
                (r_med >= g_med * 0.90) and
                (r_med > b_med)
            )
            if es_marron_claro:
                continue

        # 4. Ignorar componentes no convexos / hendiduras (solidez < 0.4)
        pts = np.column_stack((xs, ys))
        if len(pts) < 3:
            continue
        try:
            hull = ConvexHull(pts)
            area_convexa = float(hull.volume)
            sol = area_comp / area_convexa if area_convexa > 0 else 0.0
        except Exception:
            sol = 0.0
        if sol < UMBRAL_HUECO_SOLIDEZ_MIN:
            continue

        huecos_validos.append(area_comp)
        area_total += area_comp
        mascara_huecos_validos |= comp

    cantidad = len(huecos_validos)
    fraccion = area_total / area_hoja if area_hoja > 0 else 0.0
    fuerte = (
        (cantidad >= HUECOS_FUERTE_MIN_CANTIDAD and fraccion >= HUECOS_FUERTE_MIN_FRACCION) or
        (cantidad >= HUECOS_FUERTE_MODERADO_CANTIDAD and fraccion >= HUECOS_FUERTE_MODERADO_FRACCION)
    )

    resultado = {
        "cantidad": cantidad,
        "fraccion": round(float(fraccion), 4),
        "fuerte": bool(fuerte),
    }
    if depuracion:
        resultado["silueta"] = silueta_eval
        resultado["mascara_huecos"] = mascara_huecos_validos
    return resultado


def fraccion_huecos_internos(
    mascara: np.ndarray | None,
    imagen: Image.Image | np.ndarray | None = None,
) -> float:
    """Calcula la fracción de huecos de mordedura respecto al área de la hoja."""
    return huecos_mordedura(mascara, imagen=imagen)["fraccion"]


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
    info_huecos = huecos_mordedura(m)
    fraccion_huecos = info_huecos["fraccion"]

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
