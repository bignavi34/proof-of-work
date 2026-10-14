import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EvidenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    technician_id: uuid.UUID
    evidence_type: str
    original_filename: str
    mime_type: str
    file_size: int
    latitude: float | None
    longitude: float | None
    captured_at: datetime | None
    uploaded_at: datetime
    checklist: dict | None
    measurements: dict | None
    description: str | None
    created_at: datetime
