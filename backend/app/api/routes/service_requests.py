from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.database import get_db
from app.models.service_request import ServiceRequest
from app.models.user import User
from app.schemas.service_request import (
    ServiceRequestCreate,
    ServiceRequestResponse,
)

router = APIRouter(
    prefix="/service-requests",
    tags=["Service Requests"],
)


@router.post(
    "",
    response_model=ServiceRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_service_request(
    data: ServiceRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service_request = ServiceRequest(
        customer_id=current_user.id,
        service_type=data.service_type.strip(),
        description=data.description.strip(),
        address=data.address.strip(),
        preferred_date=data.preferred_date,
        preferred_time=data.preferred_time,
        status="pending",
    )

    db.add(service_request)

    await db.commit()
    await db.refresh(service_request)

    return service_request


@router.get(
    "/my",
    response_model=list[ServiceRequestResponse],
)
async def get_my_service_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ServiceRequest)
        .where(
            ServiceRequest.customer_id == current_user.id,
        )
        .order_by(ServiceRequest.created_at.desc())
    )

    return result.scalars().all()


@router.get(
    "/{service_request_id}",
    response_model=ServiceRequestResponse,
)
async def get_service_request(
    service_request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ServiceRequest).where(
            ServiceRequest.id == service_request_id,
            ServiceRequest.customer_id == current_user.id,
        )
    )

    service_request = result.scalar_one_or_none()

    if service_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service request not found",
        )

    return service_request
