"""Forma de manifest.json (ver docs/contrato_modelos.md). Validarlo aquí evita errores raros en producción."""
from pydantic import BaseModel, Field, model_validator

ESPECIALISTAS_POR_DEFECTO = {
    "pimiento": "hortalizas", "papa": "hortalizas", "tomate": "hortalizas",
    "cafe": "cafe", "cacao": "cacao",
}


class Clase(BaseModel):
    id: str
    nombre: str = ""
    etiqueta: str = ""
    cultivo: str | None = None
    sana: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def _id_numerico(cls, datos):
        # Si el exportador pone el índice en "id", el identificador de texto está en "nombre".
        if isinstance(datos, dict) and isinstance(datos.get("id"), int):
            datos = {**datos, "id": datos["nombre"]}
        return datos

    @model_validator(mode="after")
    def _completar(self):
        self.etiqueta = self.etiqueta or self.id.replace("_", " ").capitalize()
        if self.sana is None:
            self.sana = self.id.endswith("_sana")
        return self


class Entrada(BaseModel):
    alto: int
    ancho: int


class Salidas(BaseModel):
    logits: str = "logits"
    cam: str | None = "cam"


class Manifest(BaseModel):
    nombre: str
    version: str
    tipo: str = Field(pattern="^(router|especialista)$")
    backbone: str = ""
    clases: list[Clase]
    entrada: Entrada
    salidas: Salidas = Salidas()
    temperatura: float = Field(1.0, gt=0)
    umbral: float = Field(0.5, ge=0, le=1)
    sha256: str
    entrenado: dict = {}
    # Solo router
    rechazo: list[str] = ["otra_planta", "no_planta"]
    especialistas: dict[str, str] = ESPECIALISTAS_POR_DEFECTO

    @property
    def ids(self) -> list[str]:
        return [c.id for c in self.clases]
