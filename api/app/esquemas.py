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
    cultivo: str | None
    estado: str
    clase: str | None
    confianza: float | None
    provincia: str | None


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
