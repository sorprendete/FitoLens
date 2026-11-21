import io
import re
from datetime import datetime, timezone
from PIL import Image

from app.db.modelos import Diagnostico
from app.reporte import consejos, pdf
from tests.conftest import foto, token


def diagnosticar(cliente, datos, **form):
    return cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", datos, "image/jpeg")}, data=form).json()


def pedir(cliente, id_, datos):
    return cliente.post(f"/api/reporte/{id_}", files={"imagen": ("hoja.jpg", datos, "image/jpeg")})


def _texto_pdf(pdf_bytes: bytes) -> bytes:
    """Une el contenido de todos los streams del PDF (descomprimidos si vienen con FlateDecode)."""
    import zlib
    partes = [pdf_bytes]
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", pdf_bytes, re.S):
        try:
            partes.append(zlib.decompress(m.group(1)))
        except zlib.error:
            partes.append(m.group(1))
    return b"".join(partes)


def contar_paginas_pdf(pdf_bytes: bytes) -> int:
    """Cuenta el número de páginas según los objetos /Type /Page del PDF."""
    return len(re.findall(rb"/Type\s*/Page\b", pdf_bytes))


def test_reporte_pdf(cliente):
    datos = foto(400, 300)
    d = diagnosticar(cliente, datos, provincia="lamas", latitud="-6.42", longitud="-76.52")
    r = pedir(cliente, d["id"], datos)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert f"fitolens-reporte-{d['id']}.pdf" in r.headers["content-disposition"]
    # Comprobar que entra en exactamente 1 página A4
    assert contar_paginas_pdf(r.content) == 1


def test_reporte_rechaza_otra_foto(cliente):
    d = diagnosticar(cliente, foto())
    assert pedir(cliente, d["id"], foto(color=(200, 10, 10))).status_code == 400


def test_reporte_inexistente(cliente):
    assert pedir(cliente, 9999, foto()).status_code == 404


def test_reporte_pdf_textos_largos_una_sola_pagina(cliente):
    """Verifica que incluso con textos extremadamente largos el PDF de diagnóstico entra en 1 sola página."""
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
        "7. Mantenga un cuaderno de campo con registro de fechas de aplicación, ingredientes activos, lotes y nombres de operarios autorizados. "
        "8. Repita la inspección visual cada 7 días en 50 plantas elegidas al azar en zig-zag en cada cuartel productivo."
    )

    d_largo = Diagnostico(
        id=8888,
        creado=datetime.now(timezone.utc),
        origen="app",
        estado="diagnostico",
        cultivo="cafe",
        clase="cafe_roya",
        confianza=0.912,
        enferma=True,
        provincia="mariscal_caceres",
        latitud=-7.123456,
        longitud=-76.654321,
        modelo_version="router@1.2.0-heavy-field+cafe_specialist_v4_onnx_quantized",
        imagen_sha256="aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
        duracion_ms=450,
    )

    orig = consejos.CLASES.get("cafe_roya")
    try:
        consejos.CLASES["cafe_roya"] = (
            "Roya amarilla de la hoja en fase esporulante severa con defoliación acelerada",
            "Hemileia vastatrix Berk. & Broome (Pucciniales: Chaconiaceae)",
            consejo_extremo,
            "critica",
        )
        img_hoja = Image.new("RGB", (600, 450), (45, 130, 50))
        pdf_bytes = pdf.generar(d_largo, img_hoja)
    finally:
        if orig:
            consejos.CLASES["cafe_roya"] = orig

    assert pdf_bytes.startswith(b"%PDF")
    paginas = contar_paginas_pdf(pdf_bytes)
    assert paginas == 1, f"El reporte con textos largos ocupó {paginas} páginas; debe ser estrictamente 1."

    # Prueba también a través del endpoint HTTP de la API
    datos = foto(500, 350)
    d = diagnosticar(cliente, datos, provincia="bellavista")
    r = pedir(cliente, d["id"], datos)
    assert r.status_code == 200
    assert contar_paginas_pdf(r.content) == 1


def test_reporte_semanal_pdf_endpoint(cliente):
    """Verifica que el endpoint de reporte semanal para autoridades exporte PDF con 'Página X de Y'."""
    adm = token(cliente)
    diagnosticar(cliente, foto(300, 200), provincia="lamas")
    r = cliente.get("/api/reportes/semanal.pdf?semanas=2", headers=adm)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert "fitolens_reporte_" in r.headers["content-disposition"]
    assert contar_paginas_pdf(r.content) >= 1


def test_separar_recomendaciones_limpias():
    """Valida que la separación de recomendaciones no genere items como '- 2.' o '- 3.' y limpie números."""
    texto_numerado = (
        "Recomendaciones de manejo: "
        "1. Retiro y destrucción inmediata de material enfermo. "
        "2. Poda de sombra al 35%. "
        "3. Aplicación de fungicida cúprico."
    )
    items = pdf._separar_recomendaciones(texto_numerado)
    assert len(items) >= 3
    for it in items:
        # Nunca debe ser solo un número
        assert not re.fullmatch(r"[\d\.\)\s\-]+", it)
        # No debe empezar con '2.' o '3.'
        assert not re.match(r"^\d+[\.\)]", it)
        # Debe tener contenido alfabetico
        assert re.search(r"[a-zA-Z]", it)

    # Caso oraciones sin números
    texto_oraciones = "Poda las ramas enfermas. Ventila el cultivo y aplica sulfato de cobre."
    items2 = pdf._separar_recomendaciones(texto_oraciones)
    assert len(items2) == 2
    assert "Poda las ramas enfermas" in items2[0]


def test_reporte_pdf_url_real_y_leyenda_mapa():
    """Valida el dominio real en el pie y que la leyenda del mapa solo salga si hay mapa de calor."""
    d = Diagnostico(
        id=777,
        creado=datetime.now(timezone.utc),
        origen="web",
        estado="diagnostico",
        cultivo="cafe",
        clase="cafe_roya",
        confianza=0.92,
        enferma=True,
        provincia="lamas",
    )
    img = Image.new("RGB", (300, 200), (30, 120, 40))

    # 1. Sin mapa de calor: no debe contener 'fitolens.pe', debe contener dominio sslip.io
    # y NO debe contener la leyenda de zonas en rojo/amarillo
    pdf_sin_mapa = pdf.generar(d, img, mapa_calor=None)
    texto = _texto_pdf(pdf_sin_mapa)
    assert b"fitolens.5-253-232-122.sslip.io" in texto
    assert b"fitolens.pe" not in texto
    assert b"Zonas en rojo/amarillo" not in texto
    assert contar_paginas_pdf(pdf_sin_mapa) == 1

    # 2. Con mapa de calor real/válido: debe incluir la leyenda
    mapa_rgba = Image.new("RGBA", (300, 200), (255, 0, 0, 128))
    pdf_con_mapa = pdf.generar(d, img, mapa_calor=mapa_rgba)
    assert b"Zonas en rojo/amarillo" in _texto_pdf(pdf_con_mapa)
    assert contar_paginas_pdf(pdf_con_mapa) == 1

