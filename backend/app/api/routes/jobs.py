from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.database import get_db
from app.models.job import Job
from app.models.user import User
from app.schemas.job import JobResponse

router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"],
)


@router.get(
    "/my",
    response_model=list[JobResponse],
)
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
