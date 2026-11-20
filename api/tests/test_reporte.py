from tests.conftest import foto


def diagnosticar(cliente, datos, **form):
    return cliente.post("/api/diagnostico", files={"imagen": ("hoja.jpg", datos, "image/jpeg")}, data=form).json()


def pedir(cliente, id_, datos):
    return cliente.post(f"/api/reporte/{id_}", files={"imagen": ("hoja.jpg", datos, "image/jpeg")})


def test_reporte_pdf(cliente):
    datos = foto(400, 300)
    d = diagnosticar(cliente, datos, provincia="lamas", latitud="-6.42", longitud="-76.52")
    r = pedir(cliente, d["id"], datos)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert f"fitolens-reporte-{d['id']}.pdf" in r.headers["content-disposition"]


def test_reporte_rechaza_otra_foto(cliente):
    d = diagnosticar(cliente, foto())
    assert pedir(cliente, d["id"], foto(color=(200, 10, 10))).status_code == 400


def test_reporte_inexistente(cliente):
    assert pedir(cliente, 9999, foto()).status_code == 404
