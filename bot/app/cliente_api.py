"""Único punto de contacto con la API de FitoLens. El bot no tiene IA propia."""
import httpx


class ErrorApi(Exception):
    """Error con un mensaje listo para mostrar al agricultor."""


class ClienteApi:
    def __init__(self, url: str, timeout: float = 60.0, transporte: httpx.AsyncBaseTransport | None = None):
        self._http = httpx.AsyncClient(base_url=url, timeout=timeout, transport=transporte)

    async def diagnosticar(self, foto: bytes, usuario_id: int, provincia: str | None = None) -> dict:
        datos = {"origen": "bot"}
        if provincia:
            datos["provincia"] = provincia
        # El límite de fotos por minuto de la API va por "IP"; así se aplica por agricultor y no a todo el bot.
        cabeceras = {"X-Forwarded-For": f"telegram-{usuario_id}"}
        try:
            r = await self._http.post("/api/diagnostico", data=datos, headers=cabeceras,
                                      files={"imagen": ("foto.jpg", foto, "image/jpeg")})
        except httpx.TimeoutException as e:
            raise ErrorApi("El análisis tardó demasiado. Inténtalo otra vez en un momento.") from e
        except httpx.HTTPError as e:
            raise ErrorApi("No pude conectarme con FitoLens. Inténtalo otra vez en unos minutos.") from e
        if r.status_code == 200:
            return r.json()
        if r.status_code in (400, 413, 415, 422, 429):
            raise ErrorApi(_detalle(r) or "No pude leer esa foto. Envía otra, por favor.")
        raise ErrorApi("FitoLens no está disponible ahora mismo. Inténtalo otra vez en unos minutos.")

    async def cerrar(self) -> None:
        await self._http.aclose()


def _detalle(r: httpx.Response) -> str | None:
    try:
        d = r.json().get("detail")
    except ValueError:
        return None
    return d if isinstance(d, str) else None
