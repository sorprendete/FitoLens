"""dispositivos: app vinculada a una cuenta y diagnósticos subidos sin duplicar (id_cliente)

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('dispositivos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('usuario_id', sa.Integer(), nullable=False),
    sa.Column('nombre', sa.String(length=80), nullable=False),
    sa.Column('creado', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ultimo_uso', sa.DateTime(timezone=True), nullable=True),
    sa.Column('revocado', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_dispositivos_usuario_id'), 'dispositivos', ['usuario_id'], unique=False)
    with op.batch_alter_table('diagnosticos') as t:
        t.add_column(sa.Column('id_cliente', sa.String(length=36), nullable=True))
        t.create_unique_constraint('uq_diagnosticos_id_cliente', ['id_cliente'])


def downgrade() -> None:
    with op.batch_alter_table('diagnosticos') as t:
        t.drop_constraint('uq_diagnosticos_id_cliente', type_='unique')
        t.drop_column('id_cliente')
    op.drop_index(op.f('ix_dispositivos_usuario_id'), table_name='dispositivos')
    op.drop_table('dispositivos')
