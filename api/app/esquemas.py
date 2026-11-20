"""Formas de entrada y salida de la API (las ve la web y el bot; documentadas en /api/docs)."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

PROVINCIAS = (
    "bellavista", "el_dorado", "huallaga", "lamas", "mariscal_caceres",
    "moyobamba", "picota", "rioja", "san_martin", "tocache",
)


class Top(BaseModel):
    clase: str
    etiqueta: str
    confianza: float


class Paso(BaseModel):
    id: str
    titulo: str
    detalle: str
    ms: int


class DiagnosticoSalida(BaseModel):
    id: int
    estado: str
    cultivo: str | None
    clase: str | None
    etiqueta: str | None
    confianza: float | None
    top3: list[Top]
    mapa_calor_png_base64: str | None
    # Hoja/fruto ubicado: polígonos de puntos [x, y] en 0-1 del encuadre de la foto. Vacío si mascara_ok es False.
    mascara_ok: bool = False
    contorno_hoja: list[list[list[float]]] = []
    pasos: list[Paso]
    modelo_version: str
    motivo: str | None
    duracion_ms: int


class UsuarioSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    nombre: str
    rol: str


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class Registro(BaseModel):
    email: EmailStr
    nombre: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=200)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioSalida


class ItemHistorial(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    creado: datetime
    origen: str
    cultivo: str | None
    estado: str
    clase: str | None
    confianza: float | None
    provincia: str | None


class Vincular(Login):
    nombre_dispositivo: str = Field(min_length=1, max_length=80)


class DispositivoSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    creado: datetime
    ultimo_uso: datetime | None
    revocado: bool


class TokenDispositivo(Token):
    dispositivo: DispositivoSalida


class Sincronizado(BaseModel):
    id: int
    id_cliente: str
    nuevo: bool  # False: ya estaba guardado (reenvío)


class Historial(BaseModel):
    items: list[ItemHistorial]


class ProvinciaBrotes(BaseModel):
    provincia: str
    total: int
    por_clase: dict[str, int]


class Brotes(BaseModel):
    desde: str
    total: int
    provincias: list[ProvinciaBrotes]


# --- Administración ---

class Resumen(BaseModel):
    usuarios: int
    analisis: int
    sanos: int
    enfermos: int
    no_concluyentes: int
    rechazadas: int
    logins_fallidos_24h: int
    bloqueos_24h: int


class UsuarioAdmin(BaseModel):
    id: int
    nombre: str
    email: str
    rol: str
    activo: bool
    creado: datetime
    ultimo_acceso: datetime | None
    diagnosticos: int


class CambioEstado(BaseModel):
    activo: bool


class EventoAuditoria(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    fecha: datetime
    accion: str
    estado: str
    email: str | None
    ip: str
    agente: str
    detalle: str | None
