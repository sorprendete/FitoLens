"""Nombres legibles para reportes y alertas. Las enfermedades salen de los manifest de los modelos cargados."""
from app.ia.registro import Registro

PROVINCIAS = {
    "bellavista": "Bellavista", "el_dorado": "El Dorado", "huallaga": "Huallaga", "lamas": "Lamas",
    "mariscal_caceres": "Mariscal Cáceres", "moyobamba": "Moyobamba", "picota": "Picota",
    "rioja": "Rioja", "san_martin": "San Martín", "tocache": "Tocache",
}
CULTIVOS = {"cafe": "Café", "cacao": "Cacao", "papa": "Papa", "tomate": "Tomate", "pimiento": "Pimiento",
            "maiz": "Maíz", "limon": "Limón", "naranja": "Naranja"}
SIN_PROVINCIA = "sin_provincia"


def provincia(p: str | None) -> str:
    return PROVINCIAS.get(p or "", "Sin provincia")


def cultivo(c: str | None) -> str:
    return CULTIVOS.get(c or "", (c or "—").capitalize())


def etiquetas(registro: Registro | None) -> dict[str, str]:
    if registro is None:
        return {}
    return {c.id: c.etiqueta for m in registro.modelos.values() for c in m.manifest.clases}


def enfermedad(clase: str | None, mapa: dict[str, str]) -> str:
    if not clase:
        return "—"
    if clase in mapa:
        return mapa[clase]
    sin_cultivo = clase.split("_", 1)[1] if "_" in clase else clase
    return sin_cultivo.replace("_", " ").capitalize()
