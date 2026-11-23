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
    jwt_dias_dispositivo: int = 90  # sesión de la app: dura más porque el teléfono pasa días sin internet
    registro_abierto: bool = False  # si es False, solo un admin crea cuentas
    admin_usuario: str | None = None  # email del admin que se crea al arrancar si no existe
    admin_clave: str | None = None
    google_client_ids: str = (
        "57119843943-eri36uvtp35t2b0nuh6kqvoqt25fc6sp.apps.googleusercontent.com,"
        "57119843943-m2sm6dhkgc3pe94mqec75gtukuoog835.apps.googleusercontent.com"
    )

    # Modelos de IA
    modelos_dir: Path = Path("/modelos")
    ort_hilos: int = 2  # hilos de ONNX Runtime por modelo
    volteo: bool = True  # si el modelo duda, promedia con la foto volteada arriba-abajo (+~0.2 s solo en esas fotos)
    segmentacion: bool = True  # ubica la hoja para el contorno y el mapa de calor (no cambia el diagnóstico)
    modelos_version: str = ""  # Release de GitHub instalado (MODELOS_VERSION en .env), solo informativo

    # Imágenes
    max_imagen_mb: float = 8.0
    max_imagen_pixeles: int = 40_000_000
    guardar_imagenes: bool = False  # guarda las fotos para reentrenar con datos de campo
    imagenes_dir: Path = Path("/datos/imagenes")

    # Protección y concurrencia
    limite_diagnosticos_minuto: int = 20  # por IP
    inferencias_simultaneas: int = 2  # máximo de diagnósticos concurrentes por worker
    espera_cola_s: float = 45.0  # tiempo máximo en cola (segundos) antes de responder 503
    login_max_fallos: int = 5  # fallos de un mismo correo antes de bloquearlo
    login_max_fallos_ip: int = 20  # más alto: en la feria muchos comparten el mismo wifi (misma IP)
    login_bloqueo_minutos: int = 15
    cors_origenes: str = ""  # lista separada por comas; vacío = mismo dominio

    # Alertas de brote: N casos de la misma enfermedad en la misma provincia dentro de la ventana
    alerta_umbral_casos: int = 3
    alerta_ventana_dias: int = 7

    # Ambigüedad maíz (cogollero vs tizón de la hoja)
    maiz_margen_ambiguedad: float = 0.15
    maiz_umbral_huecos: float = 0.03

    # Detección de fuera de distribución (OOD)
    ood_min_cultivos: float = 0.70  # suma prob cultivos soportados >= 0.70 para admitir
    ood_u1: float = 0.25  # prob(otra_planta + no_planta) > U1 -> rechazo (compatibilidad)
    ood_u2: float = 0.55  # prob max del cultivo < U2 -> rechazo (compatibilidad)
    ood_u3: float | None = None  # energia router > U3 -> rechazo
    ood_u4: float | None = None  # energia especialista > U4 -> rechazo

    @property
    def ood_umbral_min_cultivos(self) -> float:
        return self.ood_min_cultivos

    @property
    def ood_umbral_otra_no_planta(self) -> float:
        return self.ood_u1

    @property
    def ood_umbral_prob_cultivo(self) -> float:
        return self.ood_u2

    @property
    def ood_umbral_energia_router(self) -> float | None:
        return self.ood_u3

    @property
    def ood_umbral_energia_especialista(self) -> float | None:
        return self.ood_u4

    log_nivel: str = "INFO"

    @property
    def cors_lista(self) -> list[str]:
        return [o.strip() for o in self.cors_origenes.split(",") if o.strip()]


@lru_cache
def ajustes() -> Ajustes:
    return Ajustes()
