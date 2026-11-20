"""Tablas. Cualquier cambio aquí necesita una migración: `alembic revision --autogenerate -m "..."`."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def ahora() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(100))
    rol: Mapped[str] = mapped_column(String(20), default="usuario")  # usuario | admin
    activo: Mapped[bool] = mapped_column(default=True)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=ahora)


class Diagnostico(Base):
    __tablename__ = "diagnosticos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=ahora, index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), index=True)
    origen: Mapped[str] = mapped_column(String(20), default="web")  # web | bot | app
    estado: Mapped[str] = mapped_column(String(20))  # diagnostico | no_concluyente | rechazada
    cultivo: Mapped[str | None] = mapped_column(String(40))
    clase: Mapped[str | None] = mapped_column(String(80))
    confianza: Mapped[float | None] = mapped_column(Float)
    enferma: Mapped[bool] = mapped_column(default=False)
    provincia: Mapped[str | None] = mapped_column(String(40), index=True)
    latitud: Mapped[float | None] = mapped_column(Float)
    longitud: Mapped[float | None] = mapped_column(Float)
    modelo_version: Mapped[str] = mapped_column(String(120))
    imagen_sha256: Mapped[str] = mapped_column(String(64))
    duracion_ms: Mapped[int] = mapped_column(Integer)
