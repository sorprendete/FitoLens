"""Reglas que convierten el nombre de carpeta (o de clase YOLO) de cada dataset en una etiqueta FitoLens.

Devuelven:
- una clase de enfermedad (p. ej. "tomate_tizon_tardio"),
- solo el cultivo (p. ej. "tomate"): la foto sirve para el router, no para el especialista,
- "otra_planta" / "no_planta", o
- None: la foto se ignora.
El resumen "carpeta -> etiqueta" se imprime al preparar los datos para poder revisarlo.
"""
import re

CULTIVOS = ("pimiento", "papa", "tomate", "cafe", "cacao")


def _norm(s):
    return re.sub(r"[_\-,.()]+", " ", s.lower()).strip()


def _cultivo(s):
    if re.search(r"pepper|pimiento|capsicum", s):
        return "pimiento"
    if re.search(r"potato|papa\b", s):
        return "papa"
    if re.search(r"tomato|tomate", s):
        return "tomate"
    return None


def _enfermedad(s, cultivo):
    # el orden importa: lo más específico primero
    if "septoria" in s:
        return "septoriosis"
    if "target" in s:
        return "mancha_diana"
    if re.search(r"yellow|curl", s):
        return "virus_rizado_amarillo"
    if "mosaic" in s:
        return "virus_mosaico"
    if re.search(r"spider|mite", s):
        return "arana_roja"
    if re.search(r"mold|mould", s):
        return "moho_hoja"
    if "early" in s:
        return "tizon_temprano"
    if re.search(r"late|phyto?p?h?thora", s):
        return "tizon_tardio"
    if re.search(r"bacteri|spot", s):
        return "mancha_bacteriana"
    if re.search(r"healthy|sana|sano", s):
        return "sana"
    return None


def hortalizas(carpeta, cfg):
    s = _norm(carpeta)
    c = _cultivo(s)
    if c is None:
        return "otra_planta"
    e = _enfermedad(s, c)
    if e is None and cfg.get("sin_enfermedad_es_sana"):
        e = "sana"   # PlantDoc: "Tomato leaf" y "Bell_pepper leaf" son hojas sanas
    return f"{c}_{e}" if e else c


def tomate_bangladesh_2025(carpeta, cfg):
    s = _norm(carpeta)
    e = _enfermedad(s, "tomate")
    if re.search(r"miner|insect|uncategor|other|class 16", s):
        return "tomate"   # plagas sin clase propia: solo cuentan como tomate para el router
    return f"tomate_{e}" if e else "tomate"


def papa_indonesia(carpeta, cfg):
    s = _norm(carpeta)
    if "healthy" in s:
        return "papa_sana"
    if re.search(r"phyto?p?h?thora|late", s):   # la carpeta real se llama "Phytopthora"
        return "papa_tizon_tardio"
    return "papa"   # bacteria, fungi, nematode, pest, virus: sin equivalente exacto


def solo_tomate(carpeta, cfg):
    return "tomate"


def cafe(carpeta, cfg):
    s = _norm(carpeta)
    if re.search(r"healthy|sana|sano|saludable", s):
        return "cafe_sana"
    if re.search(r"rust|roya|hemileia", s):
        return "cafe_roya"
    if re.search(r"mycena|citricolor|ojo|spot|mancha", s):
        return "cafe_ojo_de_gallo"
    return "cafe"


def cacao_monilia(carpeta, cfg):
    # carpetas h0 (sana) y m1, m2, m3 (estadios de Moniliophthora roreri)
    s = _norm(carpeta)
    if re.search(r"\bh0\b|healthy|sana", s):
        return "cacao_sana"
    if re.search(r"\bm[123]\b|monilia", s):
        return "cacao_monilia"
    return "cacao"


def cacao_yolo(nombre_clase, cfg):
    s = _norm(nombre_clase)
    if re.search(r"healthy|sana|sano", s):
        return "cacao_sana"
    if "monilia" in s:
        return "cacao_monilia"
    if re.search(r"phytophthora|fito|black|negra", s):   # el dataset la llama "Fitoftora"
        return "cacao_mazorca_negra"
    return "cacao"


def no_planta(carpeta, cfg):
    s = _norm(carpeta)
    if re.search(r"flower|fruit", s):
        return "otra_planta"
    if re.search(r"airplane|car|cat|dog|motorbike|person", s):
        return "no_planta"
    return None


def etiqueta_para_modelo(etiqueta, modelo, clases):
    """Traduce una etiqueta general a la clase de un modelo concreto (o None)."""
    if modelo == "router":
        if etiqueta in clases:
            return etiqueta
        pref = etiqueta.split("_")[0]
        return pref if pref in CULTIVOS else None
    return etiqueta if etiqueta in clases else None
