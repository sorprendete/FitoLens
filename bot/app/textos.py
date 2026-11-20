"""Todo lo que el bot le dice al agricultor. Funciones puras: fáciles de probar y de editar."""
from html import escape

from app.consejos import CLASES, CULTIVOS, DESCONOCIDA, URGENCIA

PROVINCIAS = {
    "bellavista": "Bellavista", "el_dorado": "El Dorado", "huallaga": "Huallaga", "lamas": "Lamas",
    "mariscal_caceres": "Mariscal Cáceres", "moyobamba": "Moyobamba", "picota": "Picota",
    "rioja": "Rioja", "san_martin": "San Martín", "tocache": "Tocache",
}

BIENVENIDA = (
    "🌿 <b>Hola, soy FitoLens.</b>\n\n"
    "Mándame una <b>foto de una hoja</b> (o de una mazorca de cacao) y te digo si está sana "
    "o qué enfermedad tiene, y qué hacer.\n\n"
    "Reconozco: café, cacao, papa, tomate y pimiento.\n\n"
    "📸 <b>Para una buena foto:</b>\n"
    "• Una sola hoja, de cerca, que llene la foto.\n"
    "• Con luz de día, sin sombra fuerte ni flash.\n"
    "• Que se vea nítida, sin moverse.\n\n"
    "Comandos: /provincia para elegir tu provincia · /ayuda"
)
ANALIZANDO = "🔎 Analizando tu foto…"
SOLO_FOTOS = "Envíame una <b>foto</b> de la hoja enferma 📸. Si necesitas ayuda escribe /ayuda."
NO_ES_IMAGEN = "Ese archivo no es una foto. Envíame una imagen JPG o PNG."
PREGUNTA_PROVINCIA = "📍 ¿En qué provincia está tu cultivo? Así ayudas al mapa de brotes de San Martín."
AVISO = "<i>Es una orientación. Para confirmar, consulta a un técnico agrario o a SENASA. Las dosis, siempre según la etiqueta del producto.</i>"
CAPTION_MAPA = "🔥 Zonas rojas: donde la IA vio la enfermedad."


def provincia_guardada(clave: str) -> str:
    return f"✅ Provincia guardada: <b>{PROVINCIAS.get(clave, clave)}</b>. Ya puedes mandar tus fotos."


def resultado(r: dict) -> str:
    """Convierte la respuesta de POST /api/diagnostico en un mensaje en HTML de Telegram."""
    estado = r.get("estado")
    if estado == "rechazada":
        return f"🚫 <b>No reconocí un cultivo en la foto.</b>\n\n{escape(r.get('motivo') or '')}\n\n" \
               "Reconozco café, cacao, papa, tomate y pimiento."
    if estado == "no_concluyente":
        return (f"🤔 <b>No estoy seguro.</b>\n\n{escape(r.get('motivo') or '')}\n\n"
                "Consejo: toma la foto más de cerca, con buena luz y que se vea una sola hoja.")

    nombre, agente, consejo, urgencia = CLASES.get(r.get("clase") or "", DESCONOCIDA)
    nombre = r.get("etiqueta") or nombre or "Resultado"
    cultivo = CULTIVOS.get(r.get("cultivo") or "", (r.get("cultivo") or "").capitalize())
    sana = (r.get("clase") or "").endswith("_sana")
    lineas = [
        f"{'✅' if sana else '⚠️'} <b>{escape(nombre)}</b>" + (f" · {escape(cultivo)}" if cultivo else ""),
    ]
    if agente:
        lineas.append(f"Causa: <i>{escape(agente)}</i>")
    lineas += [
        f"Confianza: <b>{porcentaje(r.get('confianza'))}</b>",
        URGENCIA.get(urgencia, ""),
        "",
        f"💡 <b>Qué hacer:</b> {escape(consejo)}",
    ]
    if not sana:
        lineas += ["", AVISO]
    return "\n".join(lineas)


def porcentaje(valor: float | None) -> str:
    return "—" if valor is None else f"{round(valor * 100)} %"
