"""alertas de brote y suscripciones por Telegram

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('alertas',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('creado', sa.DateTime(timezone=True), nullable=False),
    sa.Column('actualizada', sa.DateTime(timezone=True), nullable=False),
    sa.Column('provincia', sa.String(length=40), nullable=False),
    sa.Column('cultivo', sa.String(length=40), nullable=True),
    sa.Column('clase', sa.String(length=80), nullable=False),
    sa.Column('casos', sa.Integer(), nullable=False),
    sa.Column('ventana_dias', sa.Integer(), nullable=False),
    sa.Column('notificada', sa.Boolean(), nullable=False),
    sa.Column('avisados', sa.Integer(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_alertas_creado'), 'alertas', ['creado'], unique=False)
    op.create_index(op.f('ix_alertas_actualizada'), 'alertas', ['actualizada'], unique=False)
    op.create_index(op.f('ix_alertas_provincia'), 'alertas', ['provincia'], unique=False)
    op.create_table('suscripciones',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('chat_id', sa.String(length=32), nullable=False),
    sa.Column('nombre', sa.String(length=120), nullable=False),
    sa.Column('provincia', sa.String(length=40), nullable=True),
    sa.Column('creado', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('chat_id', 'provincia')
    )
    op.create_index(op.f('ix_suscripciones_chat_id'), 'suscripciones', ['chat_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_suscripciones_chat_id'), table_name='suscripciones')
    op.drop_table('suscripciones')
    op.drop_index(op.f('ix_alertas_provincia'), table_name='alertas')
    op.drop_index(op.f('ix_alertas_actualizada'), table_name='alertas')
    op.drop_index(op.f('ix_alertas_creado'), table_name='alertas')
    op.drop_table('alertas')
