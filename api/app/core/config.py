"""Configuración de la API. Todo valor viene de variables de entorno (.env); nada va en el código."""
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Ajustes(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Base de datos
    database_url: str = "postgresql+psycopg://fitolens:fitolens@db:5432/fitolens"

    # Autenticación
    jwt_secreto: str = Field(min_length=32)  # obligatorio: openssl rand -hex 32
    jwt_minutos: int = 720
    registro_abierto: bool = False  # si es False, solo un admin crea cuentas
    admin_usuario: str | None = None  # email del admin que se crea al arrancar si no existe
    admin_clave: str | None = None

    # Modelos de IA
    modelos_dir: Path = Path("/modelos")
    ort_hilos: int = 2  # hilos de ONNX Runtime por modelo

    # Imágenes
    max_imagen_mb: float = 8.0
    max_imagen_pixeles: int = 40_000_000
    guardar_imagenes: bool = False  # guarda las fotos para reentrenar con datos de campo
    imagenes_dir: Path = Path("/datos/imagenes")

    # Protección
    limite_diagnosticos_minuto: int = 20  # por IP
    login_max_fallos: int = 5  # fallos de un mismo correo antes de bloquearlo
    login_max_fallos_ip: int = 20  # más alto: en la feria muchos comparten el mismo wifi (misma IP)
    login_bloqueo_minutos: int = 15
    cors_origenes: str = ""  # lista separada por comas; vacío = mismo dominio

    log_nivel: str = "INFO"

    @property
    def cors_lista(self) -> list[str]:
        return [o.strip() for o in self.cors_origenes.split(",") if o.strip()]


@lru_cache
def ajustes() -> Ajustes:
    return Ajustes()
