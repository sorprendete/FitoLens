"""Bot de Telegram de FitoLens: el agricultor manda una foto y recibe el diagnóstico de la API."""
import base64
import logging

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Message, Update
from telegram.constants import ChatAction, ParseMode
from telegram.ext import (Application, CallbackQueryHandler, CommandHandler, ContextTypes,
                          MessageHandler, filters)

from app import textos
from app.cliente_api import ClienteApi, ErrorApi
from app.config import ajustes

log = logging.getLogger("fitolens.bot")
MAX_BYTES = 8 * 1024 * 1024  # igual que MAX_IMAGEN_MB de la API


async def inicio(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text(textos.BIENVENIDA, parse_mode=ParseMode.HTML)


async def pedir_provincia(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text(textos.PREGUNTA_PROVINCIA, reply_markup=teclado_provincias())


async def elegir_provincia(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    consulta = update.callback_query
    clave = consulta.data.removeprefix("prov:")
    await consulta.answer()
    if clave in textos.PROVINCIAS:
        context.user_data["provincia"] = clave
        await consulta.edit_message_text(textos.provincia_guardada(clave), parse_mode=ParseMode.HTML)


async def foto(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msj = update.effective_message
    archivo = msj.photo[-1] if msj.photo else msj.document  # la foto más grande, o la imagen enviada como archivo
    if msj.document and not (msj.document.mime_type or "").startswith("image/"):
        await msj.reply_text(textos.NO_ES_IMAGEN)
        return
    if archivo.file_size and archivo.file_size > MAX_BYTES:
        await msj.reply_text("La foto pesa demasiado (máximo 8 MB). Envíala como foto, no como archivo.")
        return
    await context.bot.send_chat_action(msj.chat_id, ChatAction.TYPING)
    espera = await msj.reply_text(textos.ANALIZANDO)
    datos = bytes(await (await archivo.get_file()).download_as_bytearray())
    provincia = context.user_data.get("provincia")
    try:
        r = await context.bot_data["api"].diagnosticar(datos, update.effective_user.id, provincia)
    except ErrorApi as e:
        await espera.edit_text(f"😕 {e}")
        return
    await espera.edit_text(textos.resultado(r), parse_mode=ParseMode.HTML)
    await enviar_mapa(msj, r)
    if provincia is None and not context.user_data.get("ya_pregunte"):
        context.user_data["ya_pregunte"] = True
        await msj.reply_text(textos.PREGUNTA_PROVINCIA, reply_markup=teclado_provincias())


async def enviar_mapa(msj: Message, r: dict) -> None:
    png = r.get("mapa_calor_png_base64")
    if r.get("estado") == "diagnostico" and png and not (r.get("clase") or "").endswith("_sana"):
        await msj.reply_photo(base64.b64decode(png), caption=textos.CAPTION_MAPA)


async def otro(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text(textos.SOLO_FOTOS, parse_mode=ParseMode.HTML)


async def error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    log.exception("error en el bot", exc_info=context.error)
    if isinstance(update, Update) and update.effective_message:
        await update.effective_message.reply_text("😕 Algo falló. Inténtalo otra vez en un momento.")


def teclado_provincias() -> InlineKeyboardMarkup:
    botones = [InlineKeyboardButton(n, callback_data=f"prov:{k}") for k, n in textos.PROVINCIAS.items()]
    return InlineKeyboardMarkup([botones[i:i + 2] for i in range(0, len(botones), 2)])


def crear_app() -> Application:
    a = ajustes()

    async def al_iniciar(app: Application) -> None:
        app.bot_data["api"] = ClienteApi(a.api_url, a.api_timeout)

    async def al_cerrar(app: Application) -> None:
        await app.bot_data["api"].cerrar()

    app = Application.builder().token(a.telegram_token).post_init(al_iniciar).post_shutdown(al_cerrar).build()
    app.add_handler(CommandHandler(["start", "ayuda", "help"], inicio))
    app.add_handler(CommandHandler("provincia", pedir_provincia))
    app.add_handler(CallbackQueryHandler(elegir_provincia, pattern=r"^prov:"))
    app.add_handler(MessageHandler(filters.PHOTO | filters.Document.ALL, foto))
    app.add_handler(MessageHandler(filters.ALL & ~filters.COMMAND, otro))
    app.add_error_handler(error)
    return app


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # no escribir el token en los logs
    a, app = ajustes(), crear_app()
    if a.usar_webhook:
        log.info("modo webhook: %s", a.webhook_url)
        app.run_webhook(listen="0.0.0.0", port=8080, url_path="bot/telegram", webhook_url=a.webhook_url,
                        secret_token=a.secreto_webhook, drop_pending_updates=True)
    else:
        log.info("modo polling (sin dominio)")
        app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
