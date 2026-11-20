"""parcelas: seguimiento de parcelas y sus visitas

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('parcelas',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('usuario_id', sa.Integer(), nullable=False),
    sa.Column('nombre', sa.String(length=80), nullable=False),
    sa.Column('cultivo', sa.String(length=40), nullable=False),
    sa.Column('provincia', sa.String(length=40), nullable=True),
    sa.Column('latitud', sa.Float(), nullable=True),
    sa.Column('longitud', sa.Float(), nullable=True),
    sa.Column('creado', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_parcelas_usuario_id'), 'parcelas', ['usuario_id'], unique=False)
    op.create_table('visitas_parcela',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('parcela_id', sa.Integer(), nullable=False),
    sa.Column('diagnostico_id', sa.Integer(), nullable=True),
    sa.Column('fecha', sa.DateTime(timezone=True), nullable=False),
    sa.Column('severidad', sa.Integer(), nullable=False),
    sa.Column('tratamiento', sa.String(length=300), nullable=True),
    sa.Column('nota', sa.String(length=500), nullable=True),
    sa.ForeignKeyConstraint(['diagnostico_id'], ['diagnosticos.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['parcela_id'], ['parcelas.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_visitas_parcela_fecha'), 'visitas_parcela', ['fecha'], unique=False)
    op.create_index(op.f('ix_visitas_parcela_parcela_id'), 'visitas_parcela', ['parcela_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_visitas_parcela_parcela_id'), table_name='visitas_parcela')
    op.drop_index(op.f('ix_visitas_parcela_fecha'), table_name='visitas_parcela')
    op.drop_table('visitas_parcela')
    op.drop_index(op.f('ix_parcelas_usuario_id'), table_name='parcelas')
    op.drop_table('parcelas')
