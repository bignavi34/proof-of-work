
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.database import get_db
from app.models.evidence import Evidence
from app.models.job import Job
from app.models.user import User
from app.schemas.job import JobResponse

router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"],
)


@router.get("/my", response_model=list[JobResponse])
async def get_my_jobs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Job)
        .where(Job.customer_id == current_user.id)
        .order_by(Job.created_at.desc())
    )
    return result.scalars().all()


@router.get("/technician", response_model=list[JobResponse])
async def get_technician_jobs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "technician":
        raise HTTPException(
            status_code=403,
            detail="Technician access required",
        )

    result = await db.execute(
        select(Job)
        .where(Job.technician_id == current_user.id)
        .order_by(Job.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{job_id}/complete", response_model=JobResponse)
async def complete_job(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "technician":
        raise HTTPException(
            status_code=403,
            detail="Technician access required",
        )

    result = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = result.scalar_one_or_none()

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.technician_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the assigned technician can complete this job",
        )

    if job.status == "completed":
        return job

    if job.status != "assigned":
        raise HTTPException(
            status_code=409,
            detail="Only assigned jobs can be completed",
        )

    evidence_result = await db.execute(
        select(Evidence.evidence_type)
        .where(
            Evidence.job_id == job.id,
            Evidence.technician_id == current_user.id,
            Evidence.evidence_type.in_(
                ["before", "before_service", "after", "after_service"]
            ),
        )
    )
    evidence_types = set(evidence_result.scalars().all())

    has_before = bool(evidence_types & {"before", "before_service"})
    has_after = bool(evidence_types & {"after", "after_service"})

    if not has_before or not has_after:
        missing = []
        if not has_before:
            missing.append("before-service")
        if not has_after:
            missing.append("after-service")

        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot complete job. Upload "
                + " and ".join(missing)
                + " evidence first."
            ),
        )

    job.status = "completed"
    await db.commit()
    await db.refresh(job)

    return job

