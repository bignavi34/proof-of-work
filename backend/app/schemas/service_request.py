import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ServiceRequestCreate(BaseModel):
    service_type: str = Field(
        min_length=2,
        max_length=100,
    )

    description: str = Field(
        min_length=5,
        max_length=5000,
    )

    address: str = Field(
        min_length=5,
        max_length=2000,
    )

    preferred_date: str | None = Field(
        default=None,
        max_length=20,
    )

    preferred_time: str | None = Field(
        default=None,
        max_length=50,
    )


class ServiceRequestResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    service_type: str
    description: str
    address: str
    preferred_date: str | None
    preferred_time: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class RejectServiceRequest(BaseModel):
    reason: str = Field(
        min_length=2,
        max_length=2000,
    )
