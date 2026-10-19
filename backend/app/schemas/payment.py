
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PaymentOrderRequest(BaseModel):
    job_id: uuid.UUID


class PaymentOrderResponse(BaseModel):
    payment_id: uuid.UUID
    job_id: uuid.UUID
    order_id: str
    amount: int
    currency: str
    key_id: str
    status: str


class PaymentVerifyRequest(BaseModel):
    payment_id: uuid.UUID
    razorpay_order_id: str = Field(min_length=1, max_length=100)
    razorpay_payment_id: str = Field(min_length=1, max_length=100)
    razorpay_signature: str = Field(min_length=1, max_length=255)


class PaymentResponse(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    amount_minor: int
    currency: str
    status: str
    razorpay_order_id: str | None
    razorpay_payment_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

