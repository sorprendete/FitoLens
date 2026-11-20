"""Conexión a PostgreSQL. Una sesión por petición mediante la dependencia `db`."""
from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import ajustes


@lru_cache
def fabrica() -> sessionmaker:
    motor = create_engine(ajustes().database_url, pool_pre_ping=True)
    return sessionmaker(bind=motor, expire_on_commit=False)


def db() -> Iterator[Session]:
    with fabrica()() as sesion:
        yield sesion
