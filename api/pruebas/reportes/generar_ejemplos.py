"""Script para generar PDFs de ejemplo de cada tipo con datos falsos realistas.

Uso:
    python api/pruebas/reportes/generar_ejemplos.py [carpeta_destino]

Genera:
    1. diagnostico_cafe_roya.pdf: Diagnóstico con enfermedad y foto con mapa de calor.
    2. diagnostico_tomate_sano.pdf: Diagnóstico de planta sana.
    3. diagnostico_textos_muy_largos.pdf: Diagnóstico con textos extremos que valida 1 sola hoja A4.
    4. reporte_semanal_autoridades.pdf: Reporte semanal multipágina con tablas y 'Página X de Y'.
"""
import io
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# Asegurar que api/ esté en sys.path para importar app.*
API_DIR = Path(__file__).resolve().parents[2]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.db.modelos import Diagnostico
from app.reporte import pdf as pdf_diagnostico
from app.vigilancia import pdf as pdf_vigilancia

PERU = timezone(timedelta(hours=-5))


def _crear_foto_hoja(tipo: str = "enferma", ancho: int = 800, alto: int = 600) -> Image.Image:
    """Genera una imagen sintética realista de una hoja con venas y lesiones si está enferma."""
    im = Image.new("RGB", (ancho, alto), (235, 240, 235))
    draw = ImageDraw.Draw(im)

    # Fondo suave
    y, x = np.ogrid[:alto, :ancho]
    cx, cy = ancho // 2, alto // 2

    # Silueta elíptica de hoja
    hoja_mask = (((x - cx) ** 2) / ((ancho * 0.38) ** 2) + ((y - cy) ** 2) / ((alto * 0.42) ** 2)) <= 1.0

    color_base = np.array([45, 125, 45], dtype=np.float32)
    degradado = np.zeros((alto, ancho, 3), dtype=np.uint8)
    for i in range(3):
        degradado[:, :, i] = np.clip(color_base[i] + (y / alto * 30 - 15) + (x / ancho * 20 - 10), 0, 255)

    fondo_arr = np.array(im)
    fondo_arr[hoja_mask] = degradado[hoja_mask]
    im = Image.fromarray(fondo_arr)
    draw = ImageDraw.Draw(im)

    # Nervadura principal
    draw.line([(cx, cy - int(alto * 0.38)), (cx, cy + int(alto * 0.38))], fill=(60, 160, 60), width=5)

    # Nervaduras laterales
    for offset in range(-int(alto * 0.28), int(alto * 0.28), 35):
        draw.line([(cx, cy + offset), (cx - int(ancho * 0.25), cy + offset + 20)], fill=(55, 145, 55), width=2)
        draw.line([(cx, cy + offset), (cx + int(ancho * 0.25), cy + offset + 20)], fill=(55, 145, 55), width=2)

    # Si es enferma, agregar manchas de roya / pústulas
    if tipo == "enferma":
        rng = np.random.default_rng(42)
        for _ in range(35):
            mx = int(cx + rng.normal(15, ancho * 0.12))
            my = int(cy + rng.normal(-10, alto * 0.14))
            r = int(rng.uniform(6, 22))
            # Color anaranjado / marrón de roya
            color_mancha = (int(rng.uniform(180, 220)), int(rng.uniform(90, 130)), int(rng.uniform(15, 35)))
            draw.ellipse([mx - r, my - r, mx + r, my + r], fill=color_mancha)
            # Centro oscuro
            if r > 10:
                draw.ellipse([mx - r // 2, my - r // 2, mx + r // 2, my + r // 2], fill=(120, 50, 15))

    return im


def contar_paginas_pdf(pdf_bytes: bytes) -> int:
    """Cuenta el número exacto de páginas en los bytes de un PDF."""
    return len(re.findall(rb"/Type\s*/Page\b", pdf_bytes))


def _buscar_modelos_dir() -> Path | None:
    """Busca la carpeta de modelos en la variable MODELOS_DIR o en ../modelos relativo a api."""
    candidatos = []
    env_dir = os.environ.get("MODELOS_DIR")
    if env_dir:
        candidatos.append(Path(env_dir))
    candidatos.extend([
        (API_DIR / ".." / "modelos").resolve(),
        (API_DIR / "modelos").resolve(),
    ])
    for p in candidatos:
        if p.is_dir() and any(p.glob("*/manifest.json")):
            return p
    return None


def _buscar_foto_campo(cultivo: str = "cafe") -> Image.Image | None:
    """Busca una foto real en entrenamiento/fotos_campo."""
    fotos_dir = (API_DIR / ".." / "entrenamiento" / "fotos_campo").resolve()
    if not fotos_dir.is_dir():
        return None
    candidatos = []
    for ext in ("*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG"):
        candidatos.extend(fotos_dir.rglob(ext))
    if not candidatos:
        return None
    prioritarias = [c for c in candidatos if cultivo.lower() in str(c).lower()]
    elegida = prioritarias[0] if prioritarias else candidatos[0]
    try:
        return Image.open(elegida).convert("RGB")
    except Exception:
        return None


def generar_todos(carpeta_destino: Path) -> dict[str, Path]:
    carpeta_destino.mkdir(parents=True, exist_ok=True)
    resultados = {}

    ahora = datetime.now(timezone.utc)

    # -------------------------------------------------------------
    # 1. Diagnóstico con Enfermedad: Café con Roya Amarilla
    # -------------------------------------------------------------
    d1 = Diagnostico(
        id=1024,
        creado=ahora - timedelta(hours=2),
        origen="bot",
        estado="diagnostico",
        cultivo="cafe",
        clase="cafe_roya",
        confianza=0.945,
        enferma=True,
        provincia="lamas",
        latitud=-6.42345,
        longitud=-76.52341,
        modelo_version="router@1.2.0+cafe@1.4.1",
        imagen_sha256="9a8f7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a",
        duracion_ms=280,
    )

    # Si existe la carpeta de modelos, intentar usar pipeline real + foto de campo real
    dir_modelos = _buscar_modelos_dir()
    reg = None
    if dir_modelos:
        try:
            from app.ia.registro import cargar
            reg = cargar(dir_modelos, hilos=1, segmentar=True, volteo=False)
            if not reg.listo:
                reg = None
        except Exception as e:
            print(f"Aviso al cargar modelos desde {dir_modelos}: {e}")
            reg = None

    foto_campo = _buscar_foto_campo("cafe") if reg else None
    mapa_calor1 = None

    if reg and foto_campo:
        try:
            from app.ia.pipeline import diagnosticar
            r1 = diagnosticar(reg, foto_campo)
            mapa_calor1 = r1.mapa_calor_png_base64
            foto1 = foto_campo
            if r1.clase:
                d1.clase = r1.clase
            if r1.cultivo:
                d1.cultivo = r1.cultivo
            if r1.confianza:
                d1.confianza = r1.confianza
            if r1.modelo_version:
                d1.modelo_version = r1.modelo_version
        except Exception as e:
            print(f"Aviso al diagnosticar foto de campo con modelo real: {e}")
            foto1 = _crear_foto_hoja("enferma")
            mapa_calor1 = None
    else:
        foto1 = _crear_foto_hoja("enferma")
        mapa_calor1 = None

    pdf1_bytes = pdf_diagnostico.generar(d1, foto1, mapa_calor=mapa_calor1)
    paginas_d1 = contar_paginas_pdf(pdf1_bytes)
    assert paginas_d1 == 1, f"ERROR CRÍTICO: diagnostico_cafe_roya.pdf generó {paginas_d1} páginas, debe ser exactamente 1."
    p1 = carpeta_destino / "diagnostico_cafe_roya.pdf"
    p1.write_bytes(pdf1_bytes)
    resultados["diagnostico_cafe_roya"] = p1

    # -------------------------------------------------------------
    # 2. Diagnóstico de Planta Sana: Tomate Sano
    # -------------------------------------------------------------
    d2 = Diagnostico(
        id=1025,
        creado=ahora - timedelta(minutes=45),
        origen="web",
        estado="diagnostico",
        cultivo="tomate",
        clase="tomate_sana",
        confianza=0.982,
        enferma=False,
        provincia="moyobamba",
        latitud=-6.03412,
        longitud=-76.97123,
        modelo_version="router@1.2.0+hortalizas@1.3.0",
        imagen_sha256="1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        duracion_ms=195,
    )
    foto2 = _crear_foto_hoja("sana")
    pdf2_bytes = pdf_diagnostico.generar(d2, foto2)
    paginas_d2 = contar_paginas_pdf(pdf2_bytes)
    assert paginas_d2 == 1, f"ERROR CRÍTICO: diagnostico_tomate_sano.pdf generó {paginas_d2} páginas, debe ser exactamente 1."
    p2 = carpeta_destino / "diagnostico_tomate_sano.pdf"
    p2.write_bytes(pdf2_bytes)
    resultados["diagnostico_tomate_sano"] = p2

    # -------------------------------------------------------------
    # 3. Diagnóstico con TEXTOS EXTREMADAMENTE LARGOS
    #    (Prueba de fuego para garantizar 1 sola hoja A4)
    # -------------------------------------------------------------
    consejo_extremo = (
        "Protocolo integral de emergencia agronómica para cafetales en ladera de alta pendiente: "
        "1. Retiro y destrucción inmediata de todo el material foliar que presente pústulas activas con esporulación anaranjada visible; "
        "entierre los restos en fosa sanitaria cubierta con cal viva a no menos de 50 cm de profundidad, lejos de cursos de agua. "
        "2. Regulación inmediata de la sombra del dosel arbóreo (Inga edulis y plátano) reduciéndola al 35-40% para favorecer la circulación "
        "de aire y acelerar el secado del rocío matutino en las hojas bajeras. "
        "3. Aplicación prioritaria de un fungicida sistémico registrado ante SENASA (triazol o estrobirulina) en horas de la mañana fresca "
        "o al atardecer, garantizando una cobertura homogénea del envés de la hoja con boquilla cónica hueca calibrada. "
        "4. En parcelas colindantes o con menos del 5% de incidencia foliar, aplique un fungicida protector a base de oxicloruro de cobre "
        "u óxido cuproso cada 21 a 28 días durante el periodo lluvioso. "
        "5. Notifique formalmente a los comités locales de sanidad vegetal y productores vecinos para coordinar un cordón fitosanitario "
        "preventivo, dado que la dispersión de urediniosporas por corrientes de viento supera los 3 kilómetros en valles interandinos. "
        "6. Complemente con un plan de fertilización foliar balanceada rica en potasio y silicio para engrosar la cutícula foliar y mejorar "
        "la resistencia mecánica de las hojas jóvenes a futuras reinfecciones. "
        "7. Mantenga un cuaderno de campo con registro de fechas de aplicación, ingredientes activos, lotes y nombres de operarios autorizados."
    )
    d3 = Diagnostico(
        id=999999,
        creado=ahora - timedelta(days=1),
        origen="app",
        estado="diagnostico",
        cultivo="cafe",
        clase="cafe_roya",
        confianza=0.887,
        enferma=True,
        provincia="mariscal_caceres",
        latitud=-7.17234,
        longitud=-76.72145,
        modelo_version="router@1.2.0-heavy-field+cafe_specialist_v4_onnx_quantized",
        imagen_sha256="ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100",
        duracion_ms=512,
    )
    # Inyectar temporalmente consejo extremo en el catálogo
    from app.reporte import consejos
    consejo_original = consejos.CLASES.get("cafe_roya")
    try:
        consejos.CLASES["cafe_roya"] = (
            "Roya amarilla de la hoja en fase esporulante severa con defoliación acelerada",
            "Hemileia vastatrix Berk. & Broome (Pucciniales: Chaconiaceae)",
            consejo_extremo,
            "critica",
        )
        foto3 = _crear_foto_hoja("enferma", ancho=900, alto=650)
        pdf3_bytes = pdf_diagnostico.generar(d3, foto3)
    finally:
        if consejo_original:
            consejos.CLASES["cafe_roya"] = consejo_original

    paginas_d3 = contar_paginas_pdf(pdf3_bytes)
    assert paginas_d3 == 1, f"ERROR CRÍTICO: El PDF de diagnóstico con textos largos generó {paginas_d3} páginas, debe ser exactamente 1."
    p3 = carpeta_destino / "diagnostico_textos_muy_largos.pdf"
    p3.write_bytes(pdf3_bytes)
    resultados["diagnostico_textos_muy_largos"] = p3

    # -------------------------------------------------------------
    # 4. Reporte Semanal para Autoridades (Vigilancia Fitosanitaria)
    # -------------------------------------------------------------
    datos_semanal = {
        "desde": (ahora.date() - timedelta(days=28)).isoformat(),
        "hasta": ahora.date().isoformat(),
        "totales": {
            "analisis": 486,
            "enfermos": 134,
            "sanos": 352,
            "provincias_con_casos": 7,
            "alertas": 3,
        },
        "semanas": [
            {"inicio": (ahora.date() - timedelta(days=28)).isoformat(), "analisis": 110, "enfermos": 28},
            {"inicio": (ahora.date() - timedelta(days=21)).isoformat(), "analisis": 125, "enfermos": 34},
            {"inicio": (ahora.date() - timedelta(days=14)).isoformat(), "analisis": 118, "enfermos": 31},
            {"inicio": (ahora.date() - timedelta(days=7)).isoformat(), "analisis": 133, "enfermos": 41},
        ],
        "filas": [
            {
                "provincia": "lamas", "provincia_nombre": "Lamas",
                "cultivo": "cafe", "cultivo_nombre": "Café",
                "analisis": 142, "sanos": 98, "enfermos": 44, "pct_enfermos": 0.31,
                "tendencia": "sube", "tendencia_pct": 24,
                "principal": {"clase": "cafe_roya", "etiqueta": "Roya amarilla", "casos": 38},
                "enfermedades": [
                    {"clase": "cafe_roya", "etiqueta": "Roya amarilla", "casos": 38},
                    {"clase": "cafe_ojo_de_gallo", "etiqueta": "Ojo de gallo", "casos": 6},
                ],
            },
            {
                "provincia": "mariscal_caceres", "provincia_nombre": "Mariscal Cáceres",
                "cultivo": "cacao", "cultivo_nombre": "Cacao",
                "analisis": 95, "sanos": 62, "enfermos": 33, "pct_enfermos": 0.347,
                "tendencia": "sube", "tendencia_pct": 18,
                "principal": {"clase": "cacao_monilia", "etiqueta": "Moniliasis", "casos": 25},
                "enfermedades": [
                    {"clase": "cacao_monilia", "etiqueta": "Moniliasis", "casos": 25},
                    {"clase": "cacao_mazorca_negra", "etiqueta": "Mazorca negra", "casos": 8},
                ],
            },
            {
                "provincia": "moyobamba", "provincia_nombre": "Moyobamba",
                "cultivo": "tomate", "cultivo_nombre": "Tomate",
                "analisis": 78, "sanos": 58, "enfermos": 20, "pct_enfermos": 0.256,
                "tendencia": "baja", "tendencia_pct": -12,
                "principal": {"clase": "tomate_tizon_tardio", "etiqueta": "Tizón tardío", "casos": 14},
                "enfermedades": [
                    {"clase": "tomate_tizon_tardio", "etiqueta": "Tizón tardío", "casos": 14},
                    {"clase": "tomate_mancha_bacteriana", "etiqueta": "Mancha bacteriana", "casos": 6},
                ],
            },
            {
                "provincia": "rioja", "provincia_nombre": "Rioja",
                "cultivo": "maiz", "cultivo_nombre": "Maíz",
                "analisis": 64, "sanos": 49, "enfermos": 15, "pct_enfermos": 0.234,
                "tendencia": "estable", "tendencia_pct": 0,
                "principal": {"clase": "maiz_gusano_cogollero", "etiqueta": "Gusano cogollero", "casos": 11},
                "enfermedades": [
                    {"clase": "maiz_gusano_cogollero", "etiqueta": "Gusano cogollero", "casos": 11},
                    {"clase": "maiz_tizon_hoja", "etiqueta": "Tizón de la hoja", "casos": 4},
                ],
            },
            {
                "provincia": "tocache", "provincia_nombre": "Tocache",
                "cultivo": "citricos", "cultivo_nombre": "Naranja",
                "analisis": 55, "sanos": 44, "enfermos": 11, "pct_enfermos": 0.200,
                "tendencia": "nuevo", "tendencia_pct": None,
                "principal": {"clase": "naranja_cancrosis", "etiqueta": "Cancrosis bacteriana", "casos": 7},
                "enfermedades": [
                    {"clase": "naranja_cancrosis", "etiqueta": "Cancrosis bacteriana", "casos": 7},
                    {"clase": "naranja_melanosis", "etiqueta": "Melanosis", "casos": 4},
                ],
            },
            {
                "provincia": "bellavista", "provincia_nombre": "Bellavista",
                "cultivo": "papa", "cultivo_nombre": "Papa",
                "analisis": 52, "sanos": 41, "enfermos": 11, "pct_enfermos": 0.212,
                "tendencia": "baja", "tendencia_pct": -20,
                "principal": {"clase": "papa_tizon_tardio", "etiqueta": "Tizón tardío (rancha)", "casos": 9},
                "enfermedades": [
                    {"clase": "papa_tizon_tardio", "etiqueta": "Tizón tardío (rancha)", "casos": 9},
                    {"clase": "papa_tizon_temprano", "etiqueta": "Tizón temprano", "casos": 2},
                ],
            },
        ],
        "alertas": [
            {
                "id": 1,
                "creado": (ahora - timedelta(days=2)).isoformat(),
                "provincia": "lamas", "provincia_nombre": "Lamas",
                "cultivo": "cafe", "cultivo_nombre": "Café",
                "clase": "cafe_roya", "etiqueta": "Roya amarilla (foco epidémico)",
                "casos": 38,
            },
            {
                "id": 2,
                "creado": (ahora - timedelta(days=3)).isoformat(),
                "provincia": "mariscal_caceres", "provincia_nombre": "Mariscal Cáceres",
                "cultivo": "cacao", "cultivo_nombre": "Cacao",
                "clase": "cacao_monilia", "etiqueta": "Moniliasis agresiva en mazorca",
                "casos": 25,
            },
            {
                "id": 3,
                "creado": (ahora - timedelta(days=5)).isoformat(),
                "provincia": "moyobamba", "provincia_nombre": "Moyobamba",
                "cultivo": "tomate", "cultivo_nombre": "Tomate",
                "clase": "tomate_tizon_tardio", "etiqueta": "Tizón tardío en invernadero",
                "casos": 14,
            },
        ],
    }

    pdf4_bytes = pdf_vigilancia.exportar(datos_semanal)
    p4 = carpeta_destino / "reporte_semanal_autoridades.pdf"
    p4.write_bytes(pdf4_bytes)
    resultados["reporte_semanal_autoridades"] = p4

    return resultados


def main():
    destino = Path(sys.argv[1]) if len(sys.argv) > 1 else (Path(__file__).parent / "salida")
    print(f"Generando ejemplos de reportes PDF en: {destino.resolve()}")
    archivos = generar_todos(destino)
    print("=" * 68)
    print(f"{'Archivo PDF':<38} | {'Páginas':<8} | {'Tamaño':<10}")
    print("-" * 68)
    for clave, ruta in archivos.items():
        contenido = ruta.read_bytes()
        pags = contar_paginas_pdf(contenido)
        tam_kb = f"{len(contenido) / 1024:.1f} KB"
        print(f"{ruta.name:<38} | {pags:<8} | {tam_kb:<10}")
    print("=" * 68)
    print("Todos los PDFs se generaron exitosamente.")


if __name__ == "__main__":
    main()
