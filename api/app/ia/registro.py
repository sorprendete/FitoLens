"""Carga todos los modelos de MODELOS_DIR al arrancar. Una carpeta con manifest.json = un modelo."""
import logging
import time
from pathlib import Path

from PIL import Image

from app.ia.modelo import ModeloOnnx
from app.ia.segmentacion import Segmentador

log = logging.getLogger("fitolens.ia")


class Registro:
    def __init__(self, modelos: dict[str, ModeloOnnx], errores: dict[str, str],
                 segmentador: Segmentador | None = None, volteo: bool = True):
        self.modelos = modelos
        self.errores = errores
        self.segmentador = segmentador  # None = sin contorno de hoja; el diagnóstico funciona igual
        self.volteo = volteo  # si duda, mira también la foto volteada (ver pipeline.LIMITE_VOLTEO)

    @property
    def router(self) -> ModeloOnnx | None:
        return next((m for m in self.modelos.values() if m.manifest.tipo == "router"), None)

    @property
    def listo(self) -> bool:
        return self.router is not None

    def especialista(self, cultivo: str) -> ModeloOnnx | None:
        nombre = self.router.manifest.especialistas.get(cultivo) if self.router else None
        return self.modelos.get(nombre) if nombre else None


def calentar(modelo: ModeloOnnx) -> int:
    """Una inferencia de prueba al arrancar: así la primera foto del público no paga la inicialización."""
    e = modelo.manifest.entrada
    inicio = time.perf_counter()
    modelo.predecir(Image.new("RGB", (e.ancho, e.alto)))
    return round((time.perf_counter() - inicio) * 1000)


def cargar(directorio: Path, hilos: int, segmentar: bool = True, volteo: bool = True) -> Registro:
    modelos, errores = {}, {}
    for carpeta in sorted(p for p in directorio.glob("*") if (p / "manifest.json").exists()):
        try:
            modelo = ModeloOnnx(carpeta, hilos)
            ms = calentar(modelo)
            modelos[modelo.manifest.nombre] = modelo
            log.info("Modelo cargado: %s (calentamiento %s ms)", modelo.version, ms)
        except Exception as e:  # un modelo roto no tumba a los demás
            errores[carpeta.name] = str(e)
            log.error("No se pudo cargar %s: %s", carpeta.name, e)
    if not any(m.manifest.tipo == "router" for m in modelos.values()):
        log.warning("No hay router en %s: /api/diagnostico responderá 503", directorio)
    return Registro(modelos, errores, Segmentador.cargar(hilos) if segmentar else None, volteo)
