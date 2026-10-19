from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.job import Job
from app.admin.dependencies import get_current_admin
from app.core.database import get_db
from app.models.admin_access import AdminAccess
from app.models.user import User
from uuid import UUID
from app.models.payment import Payment
from app.schemas.payment import PaymentResponse
from app.models.technician_access import TechnicianAccess

from app.models.service_request import ServiceRequest
from app.schemas.service_request import (
    RejectServiceRequest,
    ServiceRequestResponse,
)

router = APIRouter(
    prefix="/admin",
    tags=["Administration"],
)

class AddTechnicianRequest(BaseModel):
    email: EmailStr
class AssignTechnicianRequest(BaseModel):
    technician_id: UUID
class AddAdminRequest(BaseModel):
    email: EmailStr

@router.get("/access")
async def list_admin_access(
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AdminAccess)
        .where(AdminAccess.revoked_at.is_(None))
        .order_by(AdminAccess.created_at.desc())
    )

    admins = result.scalars().all()

    return [
        {
            "id": str(admin.id),
            "email": admin.email,
            "created_at": admin.created_at,
        }
        for admin in admins
    ]


@router.post("/access")
async def add_admin_access(
    data: AddAdminRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    email = str(data.email).lower().strip()

    result = await db.execute(
        select(AdminAccess).where(
            AdminAccess.email == email,
            AdminAccess.revoked_at.is_(None),
        )
    )

    existing = result.scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email already has administrator access",
        )

    admin_access = AdminAccess(
        email=email,
        granted_by=current_admin.id,
    )

    db.add(admin_access)

    await db.commit()
    await db.refresh(admin_access)

    return {
        "id": str(admin_access.id),
        "email": admin_access.email,
        "created_at": admin_access.created_at,
    }
@router.get(
    "/service-requests",
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
    "/service-requests/{service_request_id}",
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
    "/service-requests/{service_request_id}/accept",
)
async def accept_service_request(
    service_request_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ServiceRequest).where(
            ServiceRequest.id == service_request_id
        )
    )

    service_request = result.scalar_one_or_none()

    if service_request is None:
        raise HTTPException(
            status_code=404,
            detail="Service request not found",
        )

    # Prevent creating duplicate jobs
    existing_job_result = await db.execute(
        select(Job).where(
            Job.service_request_id == service_request.id
        )
    )

    existing_job = existing_job_result.scalar_one_or_none()

    if existing_job is not None:
        raise HTTPException(
            status_code=409,
            detail="A job already exists for this service request",
        )

    # Mark request as accepted
    service_request.status = "accepted"

    # Create the actual job
    job = Job(
        service_request_id=service_request.id,
        customer_id=service_request.customer_id,
        technician_id=None,
        assigned_by=current_admin.id,
        status="unassigned",
    )

    db.add(job)

    await db.commit()

    await db.refresh(service_request)
    await db.refresh(job)

    return {
        "service_request": service_request,
        "job": {
            "id": str(job.id),
            "service_request_id": str(job.service_request_id),
            "customer_id": str(job.customer_id),
            "technician_id": (
                str(job.technician_id)
                if job.technician_id
                else None
            ),
            "assigned_by": (
                str(job.assigned_by)
                if job.assigned_by
                else None
            ),
            "status": job.status,
            "created_at": job.created_at,
            "updated_at": job.updated_at,
        },
    }

@router.get("/jobs")
async def list_admin_jobs(
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Job).order_by(Job.created_at.desc())
    )

    jobs = result.scalars().all()

    return [
        {
            "id": str(job.id),
            "service_request_id": str(
                job.service_request_id
            ),
            "customer_id": str(job.customer_id),
            "technician_id": (
                str(job.technician_id)
                if job.technician_id
                else None
            ),
            "assigned_by": (
                str(job.assigned_by)
                if job.assigned_by
                else None
            ),
            "status": job.status,
            "created_at": job.created_at,
            "updated_at": job.updated_at,
        }
        for job in jobs
    ]
@router.get("/technicians")
async def list_technicians(
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TechnicianAccess, User)
        .join(
            User,
            User.email == TechnicianAccess.email,
        )
        .where(
            TechnicianAccess.revoked_at.is_(None),
            User.role == "technician",
        )
        .order_by(TechnicianAccess.created_at.desc())
    )

    rows = result.all()

    return [
        {
            "id": str(user.id),
            "email": technician_access.email,
            "created_at": technician_access.created_at,
        }
        for technician_access, user in rows
    ]
@router.post("/technicians")
async def add_technician(
    data: AddTechnicianRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    email = str(data.email).lower().strip()

    result = await db.execute(
        select(TechnicianAccess).where(
            TechnicianAccess.email == email,
            TechnicianAccess.revoked_at.is_(None),
        )
    )

    existing = result.scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="This email already has technician access",
        )

    technician_access = TechnicianAccess(
        email=email,
        granted_by=current_admin.id,
    )

    db.add(technician_access)

    await db.commit()
    await db.refresh(technician_access)

    return {
        "id": str(technician_access.id),
        "email": technician_access.email,
        "created_at": technician_access.created_at,
    }
@router.post("/jobs/{job_id}/assign")
async def assign_technician(
    job_id: UUID,
    data: AssignTechnicianRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    # Find job
    job_result = await db.execute(
        select(Job).where(Job.id == job_id)
    )

    job = job_result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    # Find technician
    technician_result = await db.execute(
        select(User).where(
            User.id == data.technician_id,
            User.role == "technician",
        )
    )

    technician = technician_result.scalar_one_or_none()

    if technician is None:
        raise HTTPException(
            status_code=400,
            detail="Selected user is not a technician",
        )

    # Make sure the technician still has active access
    access_result = await db.execute(
        select(TechnicianAccess).where(
            TechnicianAccess.email == technician.email,
            TechnicianAccess.revoked_at.is_(None),
        )
    )

    technician_access = access_result.scalar_one_or_none()

    if technician_access is None:
        raise HTTPException(
            status_code=400,
            detail="Selected technician does not have active technician access",
        )

    # Assign job
    job.technician_id = technician.id
    job.assigned_by = current_admin.id
    job.status = "assigned"

    await db.commit()
    await db.refresh(job)

    return {
        "id": str(job.id),
        "service_request_id": str(job.service_request_id),
        "customer_id": str(job.customer_id),
        "technician_id": str(job.technician_id),
        "assigned_by": str(job.assigned_by),
        "status": job.status,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }
@router.get("/payments", response_model=list[PaymentResponse])
async def list_payments(
    current_admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[Payment]:
    result = await db.execute(
        select(Payment).order_by(Payment.created_at.desc())
    )
    return list(result.scalars().all())
