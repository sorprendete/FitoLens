from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
from telegram.error import Forbidden

from app import alertas, main
from app.config import Ajustes

ALERTA = {"id": 9, "provincia": "moyobamba", "provincia_nombre": "Moyobamba", "cultivo": "cafe",
          "cultivo_nombre": "Café", "clase": "cafe_roya", "etiqueta": "Roya", "casos": 5, "ventana_dias": 7,
          "chats": ["111", "222"]}


def test_texto_alerta():
    t = alertas.texto_alerta(ALERTA)
    assert "Moyobamba" in t and "5 casos" in t and "Roya amarilla" in t and "café" in t and "7 días" in t
    assert "Hemileia vastatrix" in t and "Actuar en 1 o 2 días" in t


def test_texto_alerta_clase_desconocida():
    t = alertas.texto_alerta({**ALERTA, "clase": "cafe_nueva", "etiqueta": "Nueva <x>"})
    assert "Nueva &lt;x&gt;" in t


def test_clave_igual_que_api():
    import hashlib
    import hmac
    a = Ajustes(telegram_token="t", jwt_secreto="s" * 32)
    assert a.clave_bot == hmac.new(b"s" * 32, b"fitolens-bot", hashlib.sha256).hexdigest()[:48]
    assert Ajustes(telegram_token="t").clave_bot == ""


async def test_api_manda_clave_y_suscribe():
    visto = {}

    def manejador(req: httpx.Request):
        visto["clave"], visto["ruta"], visto["cuerpo"] = req.headers["x-bot-clave"], req.url.path, req.content
        return httpx.Response(200, json={"id": 1})

    api = alertas.ApiAlertas("http://api", "CLAVE", httpx.MockTransport(manejador))
    await api.suscribir(42, "Ana", "lamas")
    assert visto["clave"] == "CLAVE" and visto["ruta"] == "/api/alertas/suscripciones/bot"
    assert b'"chat_id":"42"' in visto["cuerpo"] and b"lamas" in visto["cuerpo"]


async def test_reparte_y_marca_aunque_un_chat_falle():
    api = SimpleNamespace(pendientes=AsyncMock(return_value=[ALERTA]), marcar=AsyncMock())
    bot = SimpleNamespace(send_message=AsyncMock(side_effect=[None, Forbidden("bloqueado")]))
    assert await alertas.repartir(api, bot) == 1
    assert [c.args[0] for c in bot.send_message.await_args_list] == [111, 222]
    api.marcar.assert_awaited_once_with(9, 1)


async def test_suscripcion_por_boton_muestra_brotes_vigentes():
    api = SimpleNamespace(suscribir=AsyncMock(), activas=AsyncMock(return_value=[ALERTA, {**ALERTA, "provincia": "rioja"}]))
    mensaje = SimpleNamespace(reply_text=AsyncMock())
    consulta = SimpleNamespace(data="alr:moyobamba", answer=AsyncMock(), edit_message_text=AsyncMock(), message=mensaje)
    update = SimpleNamespace(callback_query=consulta, effective_chat=SimpleNamespace(id=5),
                             effective_user=SimpleNamespace(full_name="Técnico"))
    await alertas.elegir(update, SimpleNamespace(bot_data={"alertas": api}))
    api.suscribir.assert_awaited_once_with(5, "Técnico", "moyobamba")
    assert "Moyobamba" in consulta.edit_message_text.call_args.args[0]
    assert mensaje.reply_text.await_count == 1  # solo el brote de su provincia


async def test_sin_clave_avisa_no_disponible():
    msj = SimpleNamespace(reply_text=AsyncMock())
    await alertas.pedir(SimpleNamespace(effective_message=msj), SimpleNamespace(bot_data={}))
    assert "no están disponibles" in msj.reply_text.call_args.args[0]


def test_registra_comandos_en_grupo_aparte(monkeypatch):
    monkeypatch.setenv("TELEGRAM_TOKEN", "123:ABC")
    monkeypatch.setenv("JWT_SECRETO", "s" * 32)
    main.ajustes.cache_clear()
    alertas.ajustes.cache_clear()
    app = main.crear_app()
    assert len(app.handlers[alertas.GRUPO]) == 4
    assert app.post_init.__name__ == "al_iniciar" and app.post_init.__qualname__.startswith("registrar")
