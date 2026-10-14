import uuid
from datetime import datetime

from pydantic import BaseModel


class JobResponse(BaseModel):
    id: uuid.UUID
    service_request_id: uuid.UUID
    customer_id: uuid.UUID
    technician_id: uuid.UUID | None
    assigned_by: uuid.UUID | None
    status: str
    created_at: datetime
    updated_at: datetime
