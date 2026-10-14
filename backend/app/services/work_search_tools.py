
import uuid
from datetime import date
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_access import AdminAccess
from app.models.evidence import Evidence
from app.models.evidence_analysis import EvidenceAnalysis
from app.models.job import Job
from app.models.service_request import ServiceRequest
from app.models.user import User


class WorkSearchError(Exception):
    """Raised when a work-search operation cannot be completed."""


def _serialize_datetime(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


async def _require_admin(db: AsyncSession, user: User) -> None:
    result = await db.execute(
        select(AdminAccess.id).where(
            func.lower(AdminAccess.email) == user.email.lower(),
            AdminAccess.revoked_at.is_(None),
        )
    )
    if result.scalar_one_or_none() is None:
        raise WorkSearchError("Administrator access is required.")


def _job_query(user: User, is_admin: bool):
    query = (
        select(Job, ServiceRequest)
        .join(ServiceRequest, ServiceRequest.id == Job.service_request_id)
        .order_by(Job.created_at.desc())
        .limit(50)
    )

    if not is_admin:
        query = query.where(Job.customer_id == user.id)

    return query


async def search_my_jobs(
    db: AsyncSession,
    user: User,
    query_text: str = "",
    status: str | None = None,
) -> dict:
    """Search only the authenticated customer's jobs and related requests."""
    if user.role != "customer":
        raise WorkSearchError("This search tool is available to customers only.")

    query = _job_query(user, is_admin=False)

    if status:
        query = query.where(func.lower(Job.status) == status.lower())

    if query_text.strip():
        pattern = f"%{query_text.strip()[:120]}%"
        query = query.where(
            or_(
                ServiceRequest.service_type.ilike(pattern),
                ServiceRequest.description.ilike(pattern),
                Job.status.ilike(pattern),
                ServiceRequest.status.ilike(pattern),
            )
        )

    result = await db.execute(query)
    rows = result.all()

    return {
        "count": len(rows),
        "jobs": [
            {
                "job_id": str(job.id),
                "service_request_id": str(request.id),
                "service_type": request.service_type,
                "description": request.description[:1000],
                "request_status": request.status,
                "job_status": job.status,
                "preferred_date": request.preferred_date,
                "preferred_time": request.preferred_time,
                "created_at": _serialize_datetime(job.created_at),
                "updated_at": _serialize_datetime(job.updated_at),
            }
            for job, request in rows
        ],
    }


async def search_all_jobs(
    db: AsyncSession,
    user: User,
    query_text: str = "",
    status: str | None = None,
) -> dict:
    """Search platform jobs. Requires an active administrator grant."""
    await _require_admin(db, user)

    query = _job_query(user, is_admin=True)

    if status:
        query = query.where(func.lower(Job.status) == status.lower())

    if query_text.strip():
        pattern = f"%{query_text.strip()[:120]}%"
        query = query.where(
            or_(
                ServiceRequest.service_type.ilike(pattern),
                ServiceRequest.description.ilike(pattern),
                Job.status.ilike(pattern),
                ServiceRequest.status.ilike(pattern),
            )
        )

    result = await db.execute(query)
    rows = result.all()

    return {
        "count": len(rows),
        "jobs": [
            {
                "job_id": str(job.id),
                "service_request_id": str(request.id),
                "customer_id": str(job.customer_id),
                "technician_id": (
                    str(job.technician_id) if job.technician_id else None
                ),
                "service_type": request.service_type,
                "description": request.description[:1000],
                "request_status": request.status,
                "job_status": job.status,
                "preferred_date": request.preferred_date,
                "preferred_time": request.preferred_time,
                "created_at": _serialize_datetime(job.created_at),
                "updated_at": _serialize_datetime(job.updated_at),
            }
            for job, request in rows
        ],
    }


async def get_job_details(
    db: AsyncSession,
    user: User,
    job_id: str,
    is_admin: bool = False,
) -> dict:
    """Get one job, enforcing customer ownership or administrator access."""
    try:
        parsed_id = uuid.UUID(job_id)
    except (ValueError, TypeError, AttributeError):
        return {"error": "Invalid job ID."}

    query = (
        select(Job, ServiceRequest)
        .join(ServiceRequest, ServiceRequest.id == Job.service_request_id)
        .where(Job.id == parsed_id)
    )

    if is_admin:
        await _require_admin(db, user)
    else:
        query = query.where(Job.customer_id == user.id)

    result = await db.execute(query)
    row = result.one_or_none()

    if row is None:
        # Do not disclose whether another customer's job exists.
        return {"error": "Job not found or not accessible."}

    job, request = row
    return {
        "job_id": str(job.id),
        "service_request_id": str(request.id),
        "customer_id": str(job.customer_id),
        "technician_id": str(job.technician_id) if job.technician_id else None,
        "service_type": request.service_type,
        "description": request.description,
        "address": request.address if is_admin else None,
        "request_status": request.status,
        "job_status": job.status,
        "preferred_date": request.preferred_date,
        "preferred_time": request.preferred_time,
        "created_at": _serialize_datetime(job.created_at),
        "updated_at": _serialize_datetime(job.updated_at),
    }


async def get_job_evidence(
    db: AsyncSession,
    user: User,
    job_id: str,
    is_admin: bool = False,
) -> dict:
    """Get evidence metadata for an accessible job, without exposing file URLs."""
    try:
        parsed_id = uuid.UUID(job_id)
    except (ValueError, TypeError, AttributeError):
        return {"error": "Invalid job ID."}

    job_query = select(Job.id).where(Job.id == parsed_id)
    if is_admin:
        await _require_admin(db, user)
    else:
        job_query = job_query.where(Job.customer_id == user.id)

    if (await db.execute(job_query)).scalar_one_or_none() is None:
        return {"error": "Job not found or not accessible."}

    result = await db.execute(
        select(Evidence)
        .where(Evidence.job_id == parsed_id)
        .order_by(Evidence.uploaded_at.desc())
        .limit(50)
    )

    evidence_rows = result.scalars().all()

    return {
        "count": len(evidence_rows),
        "evidence": [
            {
                "evidence_id": str(item.id),
                "evidence_type": item.evidence_type,
                "filename": item.original_filename,
                "description": item.description,
                "captured_at": _serialize_datetime(item.captured_at),
                "uploaded_at": _serialize_datetime(item.uploaded_at),
                "checklist": item.checklist,
                "measurements": item.measurements,
            }
            for item in evidence_rows
        ],
    }


async def get_evidence_analysis(
    db: AsyncSession,
    user: User,
    evidence_id: str,
    is_admin: bool = False,
) -> dict:
    """Get the latest saved AI analysis for evidence the caller can access."""
    try:
        parsed_id = uuid.UUID(evidence_id)
    except (ValueError, TypeError, AttributeError):
        return {"error": "Invalid evidence ID."}

    access_query = (
        select(Evidence.id)
        .join(Job, Job.id == Evidence.job_id)
        .where(Evidence.id == parsed_id)
    )

    if is_admin:
        await _require_admin(db, user)
    else:
        access_query = access_query.where(Job.customer_id == user.id)

    if (await db.execute(access_query)).scalar_one_or_none() is None:
        return {"error": "Evidence not found or not accessible."}

    result = await db.execute(
        select(EvidenceAnalysis)
        .where(EvidenceAnalysis.evidence_id == parsed_id)
        .order_by(EvidenceAnalysis.created_at.desc())
        .limit(1)
    )
    analysis = result.scalars().first()

    if analysis is None:
        return {"message": "No saved AI analysis exists for this evidence yet."}

    return {
        "evidence_id": str(parsed_id),
        "model_name": analysis.model_name,
        "status": analysis.status,
        "result": analysis.result,
        "created_at": _serialize_datetime(analysis.created_at),
        "note": "AI analysis is advisory and does not independently prove work completion.",
    }

