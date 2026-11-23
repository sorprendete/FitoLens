"""Formas de entrada y salida de la API (las ve la web y el bot; documentadas en /api/docs)."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

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
    model_config = ConfigDict(extra="ignore")
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
    motivo_codigo: str | None = None
    duracion_ms: int


class UsuarioSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    nombre: str
    rol: str
    tiene_clave: bool = True


class PerfilActualizar(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)

    @field_validator("nombre")
    @classmethod
    def validar_nombre(cls, v: str) -> str:
        s = v.strip()
        if len(s) < 2 or len(s) > 120:
            raise ValueError("El nombre debe tener entre 2 y 120 caracteres.")
        return s


class CambiarClave(BaseModel):
    actual: str | None = None
    nueva: str

    @field_validator("nueva")
    @classmethod
    def validar_nueva(cls, v: str) -> str:
        b = v.encode("utf-8")
        if len(b) < 8:
            raise ValueError("La nueva contraseña debe tener al menos 8 caracteres.")
        if len(b) > 72:
            raise ValueError("La nueva contraseña no puede superar los 72 bytes.")
        return v


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class LoginGoogle(BaseModel):
    id_token: str = Field(min_length=1)


class Registro(BaseModel):
    email: EmailStr
    nombre: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=72)


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
    parcela_id: int | None = None
    parcela_nombre: str | None = None


class DiagnosticoParcelaEntrada(BaseModel):
    diagnostico_id: int
    severidad: int | None = Field(None, ge=0, le=3)
    nota: str | None = Field(None, max_length=500)


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
