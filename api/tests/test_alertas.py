from datetime import datetime, timedelta, timezone

from tests.conftest import token
from tests.test_diagnostico import enviar


def bot():
    from app.rutas.alertas import clave_bot
    return {"X-Bot-Clave": clave_bot()}


def casos(cliente, n, provincia="moyobamba"):
    for _ in range(n):
        assert enviar(cliente, provincia=provincia).status_code == 200


def test_alerta_aparece_al_llegar_al_umbral(cliente):
    casos(cliente, 2)
    r = cliente.get("/api/alertas").json()
    assert r["umbral"] == 3 and r["ventana_dias"] == 7 and r["alertas"] == []
    casos(cliente, 1)
    casos(cliente, 2, "rioja")  # otra provincia, bajo el umbral
    a = cliente.get("/api/alertas").json()["alertas"]
    assert len(a) == 1
    assert a[0]["provincia"] == "moyobamba" and a[0]["provincia_nombre"] == "Moyobamba"
    assert a[0]["clase"] == "tomate_tizon_tardio" and a[0]["casos"] == 3 and a[0]["cultivo_nombre"] == "Tomate"
    casos(cliente, 1)
    a2 = cliente.get("/api/alertas").json()["alertas"]
    assert a2[0]["id"] == a[0]["id"] and a2[0]["casos"] == 4  # la misma alerta, no una nueva


def test_umbral_configurable(cliente, monkeypatch):
    from app.core.config import ajustes
    monkeypatch.setattr(ajustes(), "alerta_umbral_casos", 1)
    casos(cliente, 1, "tocache")
    assert cliente.get("/api/alertas").json()["alertas"][0]["provincia"] == "tocache"


def test_alerta_caduca_sin_casos_nuevos(cliente):
    casos(cliente, 3)
    from app.db.sesion import fabrica
    from app.vigilancia.alertas import evaluar
    with fabrica()() as s:
        assert len(evaluar(s)) == 1
        assert evaluar(s, datetime.now(timezone.utc) + timedelta(days=8)) == []


def test_bot_reparte_a_suscritos_de_la_provincia(cliente):
    assert cliente.get("/api/alertas/pendientes").status_code == 403
    assert cliente.get("/api/alertas/pendientes", headers={"X-Bot-Clave": "x"}).status_code == 403
    for chat, prov in (("111", "moyobamba"), ("222", None), ("333", "rioja")):
        r = cliente.post("/api/alertas/suscripciones/bot", headers=bot(),
                         json={"chat_id": chat, "nombre": "Técnico", "provincia": prov})
        assert r.status_code == 200, r.text
    # suscribirse dos veces no duplica
    cliente.post("/api/alertas/suscripciones/bot", headers=bot(), json={"chat_id": "111", "provincia": "moyobamba"})
    assert len(cliente.get("/api/alertas/suscripciones/bot/111", headers=bot()).json()) == 1
    assert cliente.post("/api/alertas/suscripciones/bot", headers=bot(),
                        json={"chat_id": "1", "provincia": "lima"}).status_code == 400

    casos(cliente, 3)
    p = cliente.get("/api/alertas/pendientes", headers=bot()).json()["alertas"]
    assert len(p) == 1 and p[0]["chats"] == ["111", "222"]
    assert cliente.post(f"/api/alertas/{p[0]['id']}/notificada", headers=bot(), json={"avisados": 2}).status_code == 200
    assert cliente.get("/api/alertas/pendientes", headers=bot()).json()["alertas"] == []
    assert cliente.get("/api/alertas").json()["alertas"][0]["avisados"] == 2

    assert cliente.delete("/api/alertas/suscripciones/bot/111", headers=bot()).json() == {"borradas": 1}


def test_admin_gestiona_suscriptores(cliente):
    assert cliente.get("/api/alertas/suscripciones").status_code == 401
    h = token(cliente)
    r = cliente.post("/api/alertas/suscripciones", headers=h, json={"chat_id": "-100123", "nombre": "Agencia Agraria", "provincia": "lamas"})
    assert r.status_code == 200 and r.json()["provincia_nombre"] == "Lamas"
    lista = cliente.get("/api/alertas/suscripciones", headers=h).json()
    assert [s["chat_id"] for s in lista] == ["-100123"]
    assert cliente.delete(f"/api/alertas/suscripciones/{lista[0]['id']}", headers=h).status_code == 204
    assert cliente.get("/api/alertas/suscripciones", headers=h).json() == []


def test_reporte_semanal_y_excel(cliente):
    import io
    from openpyxl import load_workbook
    casos(cliente, 3)
    h = token(cliente)
    r = cliente.get("/api/reportes/semanal?semanas=2", headers=h).json()
    assert len(r["semanas"]) == 2 and r["totales"]["enfermos"] == 3
    f = r["filas"][0]
    assert f["provincia_nombre"] == "Moyobamba" and f["cultivo_nombre"] == "Tomate" and f["enfermos_por_semana"][-1] == 3
    assert f["tendencia"] == "nuevo"
    x = cliente.get("/api/reportes/semanal.xlsx?semanas=2", headers=h)
    assert x.status_code == 200 and "spreadsheetml" in x.headers["content-type"]
    libro = load_workbook(io.BytesIO(x.content))
    assert libro.sheetnames == ["Resumen", "Enfermedades", "Por semana", "Alertas de brote"]
    assert libro["Resumen"]["A7"].value == "Moyobamba"
    assert cliente.get("/api/reportes/semanal").status_code == 401
