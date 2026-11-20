"""Migraciones. La URL sale de DATABASE_URL (misma configuración que la API)."""
from alembic import context
from sqlalchemy import create_engine

from app.core.config import ajustes
from app.db.modelos import Base

motor = create_engine(ajustes().database_url)
with motor.connect() as conexion:
    context.configure(connection=conexion, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
