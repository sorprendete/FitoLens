"""Alertas de brote por Telegram: los técnicos se suscriben a una provincia y el bot les avisa
cuando la API detecta muchos casos de la misma enfermedad en esa zona."""
import asyncio
import logging
from html import escape

import httpx
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.error import TelegramError
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes

from app.config import ajustes
from app.consejos import CLASES, CULTIVOS, URGENCIA
from app.textos import PROVINCIAS

log = logging.getLogger("fitolens.alertas")
GRUPO = 1  # grupo aparte: no cambia los manejadores del bot principal
NO_DISPONIBLE = "Las alertas de brote no están disponibles ahora mismo."


class ApiAlertas:
    def __init__(self, url: str, clave: str, transporte: httpx.AsyncBaseTransport | None = None):
        self._http = httpx.AsyncClient(base_url=url, timeout=20, transport=transporte,
                                       headers={"X-Bot-Clave": clave})

    async def _json(self, metodo: str, ruta: str, **kw):
        r = await self._http.request(metodo, ruta, **kw)
        r.raise_for_status()
        return r.json()

    async def suscribir(self, chat_id: int, nombre: str, provincia: str | None) -> dict:
        return await self._json("POST", "/api/alertas/suscripciones/bot",
                                json={"chat_id": str(chat_id), "nombre": nombre[:120], "provincia": provincia})

    async def mias(self, chat_id: int) -> list[dict]:
        return await self._json("GET", f"/api/alertas/suscripciones/bot/{chat_id}")

    async def cancelar(self, chat_id: int) -> int:
        return (await self._json("DELETE", f"/api/alertas/suscripciones/bot/{chat_id}"))["borradas"]

    async def activas(self) -> list[dict]:
        return (await self._json("GET", "/api/alertas"))["alertas"]

    async def pendientes(self) -> list[dict]:
        return (await self._json("GET", "/api/alertas/pendientes"))["alertas"]

    async def marcar(self, alerta_id: int, avisados: int) -> None:
        await self._json("POST", f"/api/alertas/{alerta_id}/notificada", json={"avisados": avisados})

    async def cerrar(self) -> None:
        await self._http.aclose()


# ---------- textos ----------
def texto_alerta(a: dict) -> str:
    nombre, agente, consejo, urgencia = CLASES.get(a["clase"], (a.get("etiqueta") or a["clase"], None, "", "alta"))
    cultivo = CULTIVOS.get(a.get("cultivo") or "", a.get("cultivo_nombre") or "")
    lineas = [
        f"🚨 <b>Alerta de brote · {escape(a['provincia_nombre'])}</b>",
        "",
        f"<b>{a['casos']} casos</b> de <b>{escape(nombre)}</b> en {escape(cultivo.lower())} "
        f"en los últimos {a['ventana_dias']} días.",
    ]
    if agente:
        lineas.append(f"<i>{escape(agente)}</i>")
    if urgencia in URGENCIA:
        lineas.append(URGENCIA[urgencia])
    if consejo:
        lineas += ["", f"💡 {escape(consejo)}"]
    lineas += ["", "<i>Detectado por FitoLens con fotos de agricultores. Conviene verificar en campo.</i>"]
    return "\n".join(lineas)


def teclado() -> InlineKeyboardMarkup:
    botones = [InlineKeyboardButton(n, callback_data=f"alr:{k}") for k, n in PROVINCIAS.items()]
    filas = [botones[i:i + 2] for i in range(0, len(botones), 2)]
    return InlineKeyboardMarkup([*filas, [InlineKeyboardButton("📍 Todas las provincias", callback_data="alr:todas")]])


# ---------- comandos ----------
def _api(context: ContextTypes.DEFAULT_TYPE) -> ApiAlertas | None:
    return context.bot_data.get("alertas")


async def pedir(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if _api(context) is None:
        await update.effective_message.reply_text(NO_DISPONIBLE)
        return
    await update.effective_message.reply_text(
        "🚨 <b>Alertas de brote</b>\nTe aviso cuando FitoLens detecte varios casos de la misma enfermedad "
        "en tu zona. ¿Qué provincia quieres vigilar?", parse_mode=ParseMode.HTML, reply_markup=teclado())


async def elegir(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    consulta = update.callback_query
    clave = consulta.data.removeprefix("alr:")
    await consulta.answer()
    api = _api(context)
    if api is None or (clave != "todas" and clave not in PROVINCIAS):
        return
    provincia = None if clave == "todas" else clave
    usuario = update.effective_user
    try:
        await api.suscribir(update.effective_chat.id, usuario.full_name if usuario else "", provincia)
        vigentes = [a for a in await api.activas() if provincia is None or a["provincia"] == provincia]
    except httpx.HTTPError:
        log.exception("no se pudo suscribir")
        await consulta.edit_message_text("😕 No pude guardar tu suscripción. Inténtalo otra vez en un momento.")
        return
    zona = PROVINCIAS[provincia] if provincia else "todas las provincias"
    texto = (f"✅ Listo. Te avisaré de los brotes en <b>{escape(zona)}</b>.\n"
             "Para dejar de recibirlos: /sinalertas · Ver tus zonas: /misalertas")
    await consulta.edit_message_text(texto, parse_mode=ParseMode.HTML)
    for a in vigentes[:5]:  # lo que ya está pasando en su zona
        await consulta.message.reply_text(texto_alerta(a), parse_mode=ParseMode.HTML)


async def mias(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    api = _api(context)
    if api is None:
        await update.effective_message.reply_text(NO_DISPONIBLE)
        return
    try:
        lista = await api.mias(update.effective_chat.id)
    except httpx.HTTPError:
        await update.effective_message.reply_text(NO_DISPONIBLE)
        return
    if not lista:
        await update.effective_message.reply_text("No recibes alertas de brote. Suscríbete con /alertas.")
        return
    zonas = ", ".join(s["provincia_nombre"] for s in lista)
    await update.effective_message.reply_text(f"🚨 Recibes alertas de: {zonas}.\nPara dejarlas: /sinalertas")


async def cancelar(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    api = _api(context)
    if api is None:
        await update.effective_message.reply_text(NO_DISPONIBLE)
        return
    try:
        n = await api.cancelar(update.effective_chat.id)
    except httpx.HTTPError:
        await update.effective_message.reply_text(NO_DISPONIBLE)
        return
    await update.effective_message.reply_text(
        "Ya no recibirás alertas de brote." if n else "No tenías alertas activas. Suscríbete con /alertas.")


# ---------- reparto ----------
async def repartir(api: ApiAlertas, bot) -> int:
    """Envía las alertas nuevas a sus suscriptores y las marca como avisadas. Devuelve los mensajes enviados."""
    total = 0
    for a in await api.pendientes():
        enviados = 0
        for chat in a["chats"]:
            try:
                await bot.send_message(int(chat), texto_alerta(a), parse_mode=ParseMode.HTML)
                enviados += 1
            except TelegramError as e:  # bloqueó al bot, chat borrado, etc.: no frena a los demás
                log.warning("alerta %s no llegó a %s: %s", a["id"], chat, e)
        await api.marcar(a["id"], enviados)
        log.info("alerta %s (%s, %s casos) enviada a %s", a["id"], a["provincia"], a["casos"], enviados)
        total += enviados
    return total


async def bucle(app: Application, cada: int) -> None:
    while True:
        try:
            await repartir(app.bot_data["alertas"], app.bot)
        except Exception:  # la API puede estar reiniciando: se reintenta en la próxima vuelta
            log.warning("no se pudieron revisar las alertas", exc_info=True)
        await asyncio.sleep(cada)


def registrar(app: Application) -> None:
    """Agrega /alertas, /misalertas, /sinalertas y la revisión periódica de brotes."""
    a = ajustes()
    app.add_handler(CommandHandler("alertas", pedir), GRUPO)
    app.add_handler(CommandHandler("misalertas", mias), GRUPO)
    app.add_handler(CommandHandler("sinalertas", cancelar), GRUPO)
    app.add_handler(CallbackQueryHandler(elegir, pattern=r"^alr:"), GRUPO)
    if not a.clave_bot:
        log.warning("JWT_SECRETO no está en el .env del bot: alertas de brote desactivadas")
        return
    inicio_previo, cierre_previo = app.post_init, app.post_shutdown

    async def al_iniciar(ap: Application) -> None:
        if inicio_previo:
            await inicio_previo(ap)
        ap.bot_data["alertas"] = ApiAlertas(a.api_url, a.clave_bot)
        ap.create_task(bucle(ap, a.alertas_cada))

    async def al_cerrar(ap: Application) -> None:
        await ap.bot_data["alertas"].cerrar()
        if cierre_previo:
            await cierre_previo(ap)

    app.post_init, app.post_shutdown = al_iniciar, al_cerrar
