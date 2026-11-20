import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app import main, textos
from app.cliente_api import ClienteApi, ErrorApi
from app.config import Ajustes

DIAG = {"estado": "diagnostico", "cultivo": "cafe", "clase": "cafe_roya", "etiqueta": "Roya amarilla",
        "confianza": 0.913, "motivo": None, "mapa_calor_png_base64": base64.b64encode(b"png").decode()}


# ---------- textos ----------
def test_resultado_enfermedad():
    t = textos.resultado(DIAG)
    assert "Roya amarilla" in t and "Café" in t and "91 %" in t
    assert "Hemileia vastatrix" in t and "fungicida" in t and "SENASA" in t


def test_resultado_sana_sin_aviso():
    t = textos.resultado({**DIAG, "clase": "cacao_sana", "cultivo": "cacao", "etiqueta": None})
    assert "Planta sana" in t and "SENASA" not in t


@pytest.mark.parametrize("estado,frase", [("rechazada", "No reconocí"), ("no_concluyente", "No estoy seguro")])
def test_resultado_sin_diagnostico(estado, frase):
    t = textos.resultado({"estado": estado, "motivo": "Foto <borrosa>"})
    assert frase in t and "&lt;borrosa&gt;" in t  # el motivo se escapa para el HTML de Telegram


def test_clase_desconocida_no_falla():
    t = textos.resultado({**DIAG, "clase": "cafe_nueva", "etiqueta": "Nueva"})
    assert "Nueva" in t and "agrónomo" in t


def test_consejos_igual_que_web():
    """El catálogo del bot debe tener las mismas clases que web/src/datos/clases.js."""
    import re
    from pathlib import Path
    web = Path(__file__).parents[2] / "web/src/datos/clases.js"
    if not web.exists():
        pytest.skip("web no está junto al bot")
    ids = set(re.findall(r"^\s+([a-z_]+): (?:C\(|SANA)", web.read_text(), re.M))
    from app.consejos import CLASES
    assert ids == set(CLASES)


# ---------- cliente de la API ----------
def cliente(manejador):
    return ClienteApi("http://api", transporte=httpx.MockTransport(manejador))


async def test_cliente_envia_foto_y_origen():
    visto = {}

    def manejador(req: httpx.Request):
        visto["cuerpo"], visto["xff"] = req.content, req.headers["x-forwarded-for"]
        return httpx.Response(200, json=DIAG)

    r = await cliente(manejador).diagnosticar(b"JPEG", 42, "lamas")
    assert r["clase"] == "cafe_roya" and visto["xff"] == "telegram-42"
    assert b'name="origen"' in visto["cuerpo"] and b"bot" in visto["cuerpo"] and b"lamas" in visto["cuerpo"]


@pytest.mark.parametrize("codigo,cuerpo,frase", [
    (429, {"detail": "Demasiadas fotos seguidas. Espera un minuto."}, "Espera un minuto"),
    (400, {"detail": "La imagen no es válida."}, "no es válida"),
    (503, {"detail": "Los modelos no están cargados."}, "no está disponible"),
])
async def test_cliente_errores_en_espanol(codigo, cuerpo, frase):
    with pytest.raises(ErrorApi, match=frase):
        await cliente(lambda _: httpx.Response(codigo, json=cuerpo)).diagnosticar(b"x", 1)


async def test_cliente_sin_conexion():
    def caido(req):
        raise httpx.ConnectError("caído", request=req)
    with pytest.raises(ErrorApi, match="conectarme"):
        await cliente(caido).diagnosticar(b"x", 1)


# ---------- configuración ----------
def test_modo_webhook_segun_dominio():
    assert Ajustes(telegram_token="t", dominio="1.2.3.4.sslip.io").usar_webhook
    assert not Ajustes(telegram_token="t", dominio="").usar_webhook
    assert not Ajustes(telegram_token="t", dominio="CAMBIAR.sslip.io").usar_webhook
    a = Ajustes(telegram_token="t", dominio="x.pe")
    assert a.webhook_url == "https://x.pe/bot/telegram" and len(a.secreto_webhook) == 48


# ---------- manejador de fotos ----------
async def test_flujo_foto_completo():
    espera = SimpleNamespace(edit_text=AsyncMock())
    archivo = SimpleNamespace(file_size=1000, get_file=AsyncMock(return_value=SimpleNamespace(
        download_as_bytearray=AsyncMock(return_value=bytearray(b"JPEG")))))
    msj = SimpleNamespace(photo=[archivo], document=None, chat_id=1,
                          reply_text=AsyncMock(return_value=espera), reply_photo=AsyncMock())
    update = SimpleNamespace(effective_message=msj, effective_user=SimpleNamespace(id=7))
    api = MagicMock(diagnosticar=AsyncMock(return_value=DIAG))
    context = SimpleNamespace(bot=SimpleNamespace(send_chat_action=AsyncMock()), user_data={}, bot_data={"api": api})

    await main.foto(update, context)

    api.diagnosticar.assert_awaited_once_with(b"JPEG", 7, None)
    assert "Roya amarilla" in espera.edit_text.call_args.args[0]
    msj.reply_photo.assert_awaited_once()          # mapa de calor
    assert context.user_data["ya_pregunte"]          # pidió la provincia una sola vez


def test_app_registra_manejadores(monkeypatch):
    monkeypatch.setenv("TELEGRAM_TOKEN", "123:ABC")
    main.ajustes.cache_clear()
    assert len(main.crear_app().handlers[0]) == 5
