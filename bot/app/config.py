"""Configuración del bot. Todo viene de despliegue/.env; nada va en el código."""
import hashlib
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Ajustes(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    telegram_token: str
    api_url: str = "http://api:8000"
    dominio: str = ""          # si existe, el bot usa webhook en https://DOMINIO/bot/telegram
    bot_modo: str = "auto"     # auto | webhook | polling (polling: sin dominio, p. ej. modo offline)
    api_timeout: float = 60.0

    @property
    def usar_webhook(self) -> bool:
        if self.bot_modo == "auto":
            return bool(self.dominio) and "CAMBIAR" not in self.dominio
        return self.bot_modo == "webhook"

    @property
    def webhook_url(self) -> str:
        return f"https://{self.dominio}/bot/telegram"

    @property
    def secreto_webhook(self) -> str:
        """Telegram lo manda en cada llamada; así nadie más puede inyectar mensajes. Se deriva del token."""
        return hashlib.sha256(self.telegram_token.encode()).hexdigest()[:48]


@lru_cache
def ajustes() -> Ajustes:
    return Ajustes()
