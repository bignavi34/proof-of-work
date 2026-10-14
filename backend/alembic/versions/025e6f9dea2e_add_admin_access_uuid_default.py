"""add admin access uuid default

Revision ID: 025e6f9dea2e
Revises: bc00cb19daa4
Create Date: 2026-10-03 11:14:04.269306

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "025e6f9dea2e"
down_revision: Union[str, Sequence[str], None] = "bc00cb19daa4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "admin_access",
        "id",
        existing_type=sa.UUID(),
        server_default=sa.text("gen_random_uuid()"),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "admin_access",
        "id",
        existing_type=sa.UUID(),
        server_default=None,
        existing_nullable=False,
    )
