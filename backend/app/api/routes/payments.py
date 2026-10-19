
import logging
import uuid
from app.schemas.payment import PaymentVerifyRequest
from app.services.razorpay_service import (
    create_order,
    fetch_payment,
    verify_checkout_signature,
)
from app.schemas.payment import (
    PaymentOrderRequest,
    PaymentOrderResponse,
    PaymentVerifyRequest,
    PaymentResponse,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.job import Job
from app.models.payment import Payment
from app.models.service_request import ServiceRequest
from app.models.user import User
from app.schemas.payment import PaymentOrderRequest, PaymentOrderResponse
from app.services.razorpay_service import create_order
from app.services.service_pricing import get_service_price_paise

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/orders", response_model=PaymentOrderResponse)
async def create_payment_order(
    data: PaymentOrderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentOrderResponse:
    if current_user.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can initiate payments",
        )

    result = await db.execute(
        select(Job, ServiceRequest)
        .join(ServiceRequest, Job.service_request_id == ServiceRequest.id)
        .where(
            Job.id == data.job_id,
            Job.customer_id == current_user.id,
            ServiceRequest.customer_id == current_user.id,
        )
        .with_for_update(of=Job)
    ) 
    job_and_request = result.one_or_none()

    if job_and_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    job, service_request = job_and_request

    try:
        amount_paise = get_service_price_paise(service_request.service_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This service does not have a configured payment price",
        ) from None

    payment_result = await db.execute(
        select(Payment).where(Payment.job_id == job.id)
    )
    payment = payment_result.scalar_one_or_none()

    if payment and payment.status == "paid":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This job has already been paid",
        )

    if payment and payment.status in {"created", "pending"}:
        if payment.razorpay_order_id:
            return PaymentOrderResponse(
                payment_id=payment.id,
                job_id=job.id,
                order_id=payment.razorpay_order_id,
                amount=payment.amount_minor,
                currency=payment.currency,
                key_id=settings.razorpay_key_id,
                status=payment.status,
            )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A payment is already being processed. Please retry shortly.",
        )

    try:
        razorpay_order = create_order(
            amount_paise=amount_paise,
            receipt=f"job_{job.id.hex[:32]}",
        )
    except Exception:
        logger.exception("Failed to create Razorpay order for job %s", job.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create a payment order. Please try again.",
        ) from None

    if payment is None:
        payment = Payment(
            job_id=job.id,
            customer_id=current_user.id,
            amount_minor=amount_paise,
            currency="INR",
            status="created",
            razorpay_order_id=razorpay_order["id"],
        )
        db.add(payment)
    else:
        payment.amount_minor = amount_paise
        payment.currency = "INR"
        payment.status = "created"
        payment.razorpay_order_id = razorpay_order["id"]
        payment.razorpay_payment_id = None

    try:
        await db.commit()
        await db.refresh(payment)
    except Exception:
        await db.rollback()
        logger.exception("Failed to save payment order for job %s", job.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save the payment order. Please try again.",
        ) from None

    return PaymentOrderResponse(
        payment_id=payment.id,
        job_id=job.id,
        order_id=payment.razorpay_order_id,
        amount=payment.amount_minor,
        currency=payment.currency,
        key_id=settings.razorpay_key_id,
        status=payment.status,
    )

@router.post("/verify")
async def verify_payment(
    data: PaymentVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can verify payments",
        )

    result = await db.execute(
        select(Payment).where(
            Payment.id == data.payment_id,
            Payment.customer_id == current_user.id,
        )
    )
    payment = result.scalar_one_or_none()

    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found",
        )

    if payment.status == "paid":
        if payment.razorpay_payment_id == data.razorpay_payment_id:
            return {"status": "paid", "message": "Payment already verified"}

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This payment has already been completed",
        )

    if payment.razorpay_order_id != data.razorpay_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order does not match this payment",
        )

    valid_signature = verify_checkout_signature(
        order_id=data.razorpay_order_id,
        payment_id=data.razorpay_payment_id,
        signature=data.razorpay_signature,
    )

    if not valid_signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payment signature",
        )

    try:
        gateway_payment = fetch_payment(data.razorpay_payment_id)
    except Exception:
        logger.exception("Could not fetch Razorpay payment details")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not verify payment status. Please try again.",
        ) from None

    if gateway_payment.get("order_id") != payment.razorpay_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment does not belong to this order",
        )

    if gateway_payment.get("amount") != payment.amount_minor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount does not match the order",
        )

    if gateway_payment.get("currency") != payment.currency:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment currency does not match the order",
        )

    gateway_status = gateway_payment.get("status")

    if gateway_status != "captured":
        if gateway_status in {"failed"}:
            payment.status = "failed"
            await db.commit()

        return {
            "status": gateway_status or "pending",
            "message": (
                "Payment is not captured yet. "
                "The payment record has not been marked as paid."
            ),
        }

    payment.razorpay_payment_id = data.razorpay_payment_id
    payment.status = "paid"

    try:
        await db.commit()
        await db.refresh(payment)
    except Exception:
        await db.rollback()
        logger.exception("Could not save verified payment")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payment was verified but its status could not be saved.",
        ) from None

    return {
        "status": payment.status,
        "message": "Payment verified successfully",
        "payment_id": str(payment.id),
    }


@router.get("/my", response_model=list[PaymentResponse])
async def get_my_payments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Payment]:
    if current_user.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can view customer payment history",
        )

    result = await db.execute(
        select(Payment)
        .where(Payment.customer_id == current_user.id)
        .order_by(Payment.created_at.desc())
    )
    return list(result.scalars().all())

