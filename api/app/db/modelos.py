"""Tablas. Cualquier cambio aquí necesita una migración: `alembic revision --autogenerate -m "..."`."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
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
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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


class Auditoria(Base):
    """Registro de eventos de seguridad. La API solo inserta; nadie edita ni borra desde la aplicación."""
    __tablename__ = "auditoria"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=ahora, index=True)
    accion: Mapped[str] = mapped_column(String(20), index=True)  # login | registro | diagnostico | admin
    estado: Mapped[str] = mapped_column(String(20))  # exito | fallo | bloqueado
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"))
    email: Mapped[str | None] = mapped_column(String(254), index=True)
    ip: Mapped[str] = mapped_column(String(64), index=True)
    agente: Mapped[str] = mapped_column(String(300), default="")
    detalle: Mapped[str | None] = mapped_column(String(500))


class Parcela(Base):
    """Parcela de un agricultor. Sirve para seguir si mejora con el tratamiento."""
    __tablename__ = "parcelas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    nombre: Mapped[str] = mapped_column(String(80))
    cultivo: Mapped[str] = mapped_column(String(40))
    provincia: Mapped[str | None] = mapped_column(String(40))
    latitud: Mapped[float | None] = mapped_column(Float)
    longitud: Mapped[float | None] = mapped_column(Float)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=ahora)


class VisitaParcela(Base):
    """Una revisión de la parcela: severidad estimada por el agricultor, tratamiento aplicado y,
    si tomó foto, el diagnóstico de la IA."""
    __tablename__ = "visitas_parcela"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parcela_id: Mapped[int] = mapped_column(ForeignKey("parcelas.id", ondelete="CASCADE"), index=True)
    diagnostico_id: Mapped[int | None] = mapped_column(ForeignKey("diagnosticos.id", ondelete="SET NULL"))
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=ahora, index=True)
    severidad: Mapped[int] = mapped_column(Integer)  # 0 sin síntomas | 1 leve | 2 moderada | 3 grave
    tratamiento: Mapped[str | None] = mapped_column(String(300))
    nota: Mapped[str | None] = mapped_column(String(500))


# --- Alertas de brote (app/alertas) ---

class Alerta(Base):
    """Brote: muchos casos de la misma enfermedad en la misma provincia dentro de la ventana."""
    __tablename__ = "alertas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=ahora, index=True)
    actualizada: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=ahora, index=True)
    provincia: Mapped[str] = mapped_column(String(40), index=True)
    cultivo: Mapped[str | None] = mapped_column(String(40))
    clase: Mapped[str] = mapped_column(String(80))
    casos: Mapped[int] = mapped_column(Integer)
    ventana_dias: Mapped[int] = mapped_column(Integer)
    notificada: Mapped[bool] = mapped_column(default=False)  # el bot ya avisó por Telegram
    avisados: Mapped[int] = mapped_column(Integer, default=0)


class Suscripcion(Base):
    """Técnico que recibe las alertas de una provincia por Telegram. provincia=None: todas."""
    __tablename__ = "suscripciones"
    __table_args__ = (UniqueConstraint("chat_id", "provincia"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chat_id: Mapped[str] = mapped_column(String(32), index=True)
    nombre: Mapped[str] = mapped_column(String(120), default="")
    provincia: Mapped[str | None] = mapped_column(String(40))
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=ahora)
