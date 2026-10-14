"""remove old PayPal payments

Revision ID: 4db1480ab221
Revises: 76cf0b56e83f
Create Date: 2026-10-14 18:24:08.359747

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4db1480ab221'
down_revision: Union[str, Sequence[str], None] = '76cf0b56e83f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.drop_table("payments")


def downgrade() -> None:
    op.create_table(
        "payments",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("job_id", sa.UUID(), nullable=False),
        sa.Column("customer_id", sa.UUID(), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3),
                  server_default="USD", nullable=False),
        sa.Column("provider", sa.String(length=30),
                  server_default="paypal", nullable=False),
        sa.Column("status", sa.String(length=30),
                  server_default="created", nullable=False),
        sa.Column("paypal_order_id", sa.String(length=100), nullable=True),
        sa.Column("paypal_capture_id", sa.String(length=100), nullable=True),
        sa.Column("approval_url", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", name="uq_payments_job_id"),
        sa.UniqueConstraint("paypal_capture_id"),
        sa.UniqueConstraint("paypal_order_id"),
    )
