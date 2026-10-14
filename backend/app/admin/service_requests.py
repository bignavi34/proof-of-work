from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.dependencies import get_current_admin
from app.core.database import get_db
from app.models.service_request import ServiceRequest
from app.models.user import User
from app.schemas.service_request import (
    RejectServiceRequest,
    ServiceRequestResponse,
)

router = APIRouter(
    prefix="/admin/service-requests",
    tags=["Admin Service Requests"],
)


@router.get(
    "",
    response_model=list[ServiceRequestResponse],
)
async def list_service_requests(
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ServiceRequest)
        .order_by(ServiceRequest.created_at.desc())
    )

    return result.scalars().all()


@router.get(
    "/{service_request_id}",
    response_model=ServiceRequestResponse,
)
async def get_admin_service_request(
    service_request_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ServiceRequest).where(
            ServiceRequest.id == service_request_id,
        )
    )

    service_request = result.scalar_one_or_none()

    if service_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service request not found",
        )

    return service_request


@router.post(
    "/{service_request_id}/accept",
    response_model=ServiceRequestResponse,
)
async def accept_service_request(
    service_request_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ServiceRequest).where(
            ServiceRequest.id == service_request_id,
        )
    )

    service_request = result.scalar_one_or_none()

    if service_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service request not found",
        )

    if service_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Only pending service requests "
                "can be accepted"
            ),
        )

    service_request.status = "accepted"

    await db.commit()
    await db.refresh(service_request)

    return service_request


@router.post(
    "/{service_request_id}/reject",
    response_model=ServiceRequestResponse,
)
async def reject_service_request(
    service_request_id: UUID,
    data: RejectServiceRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ServiceRequest).where(
            ServiceRequest.id == service_request_id,
        )
    )

    service_request = result.scalar_one_or_none()

    if service_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service request not found",
        )

    if service_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Only pending service requests "
                "can be rejected"
            ),
        )

    service_request.status = "rejected"

    await db.commit()
    await db.refresh(service_request)

    return service_request
