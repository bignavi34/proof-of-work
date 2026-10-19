
import io
import json
import uuid
from datetime import datetime
from pathlib import Path

import cloudinary
import cloudinary.uploader
import cloudinary.utils
import httpx
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.admin_access import AdminAccess
from app.models.evidence import Evidence
from app.models.evidence_analysis import EvidenceAnalysis
from app.models.job import Job
from app.models.service_request import ServiceRequest
from app.models.technician_access import TechnicianAccess
from app.models.user import User
from app.schemas.evidence import EvidenceResponse
from app.services.evidence_ai import (
    EvidenceAIError,
    analyze_before_after_images,
    analyze_evidence_image,
)

router = APIRouter(prefix="/jobs", tags=["Evidence"])

MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_COMPARISON_IMAGES = 8

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

EVIDENCE_TYPE_ALIASES = {
    "before_service": "before",
    "after_service": "after",
}


def configure_cloudinary() -> None:
    """Configure Cloudinary using application settings."""
    if not all(
        (
            settings.cloudinary_cloud_name,
            settings.cloudinary_api_key,
            settings.cloudinary_api_secret,
        )
    ):
        raise RuntimeError("Cloudinary configuration is incomplete")

    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


async def user_can_access_job(
    job: Job,
    current_user: User,
    db: AsyncSession,
) -> bool:
    """Check whether the user is allowed to access this job."""
    if job.customer_id == current_user.id:
        return True

    if current_user.role == "technician":
        result = await db.execute(
            select(TechnicianAccess).where(
                TechnicianAccess.email == current_user.email,
                TechnicianAccess.revoked_at.is_(None),
            )
        )
        return (
            job.technician_id == current_user.id
            and result.scalar_one_or_none() is not None
        )

    if current_user.role == "company_admin":
        result = await db.execute(
            select(AdminAccess).where(
                AdminAccess.email == current_user.email,
                AdminAccess.revoked_at.is_(None),
            )
        )
        return result.scalar_one_or_none() is not None

    return False


async def load_evidence_image(evidence: Evidence) -> bytes:
    """Load a private Cloudinary image or a legacy local image."""
    if evidence.mime_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported evidence image type",
        )

    if evidence.cloudinary_public_id:
        try:
            configure_cloudinary()

            signed_url, _ = cloudinary.utils.cloudinary_url(
                evidence.cloudinary_public_id,
                resource_type="image",
                type="authenticated",
                sign_url=True,
                secure=True,
            )

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(signed_url)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail="Unable to retrieve evidence image",
                )

            image_data = response.content

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail="Unable to retrieve evidence image",
            ) from exc

    elif evidence.file_path:
        path = Path(evidence.file_path)

        if not path.is_file():
            raise HTTPException(
                status_code=404,
                detail="Evidence image is missing",
            )

        try:
            image_data = path.read_bytes()
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail="Unable to read evidence image",
            ) from exc

    else:
        raise HTTPException(
            status_code=404,
            detail="Evidence image is missing",
        )

    if not image_data:
        raise HTTPException(
            status_code=422,
            detail="Evidence image is empty",
        )

    if len(image_data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Evidence image exceeds the analysis size limit",
        )

    return image_data


async def get_job_and_authorize(
    job_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
    action: str,
) -> Job:
    """Load a job and verify access before returning its data."""
    result = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    if not await user_can_access_job(job, current_user, db):
        raise HTTPException(
            status_code=403,
            detail=f"You are not allowed to {action}",
        )

    return job


async def get_job_description(
    job: Job,
    db: AsyncSession,
) -> str:
    """Build AI context from the original service request."""
    result = await db.execute(
        select(ServiceRequest).where(
            ServiceRequest.id == job.service_request_id
        )
    )
    service_request = result.scalar_one_or_none()

    if service_request is None:
        raise HTTPException(
            status_code=404,
            detail="Service request associated with this job was not found",
        )

    return (
        f"Service type: {service_request.service_type}\n"
        f"Customer's requested work: {service_request.description}"
    )


def serialize_analysis(
    analysis: EvidenceAnalysis,
    job_id: uuid.UUID,
) -> dict:
    return {
        "id": str(analysis.id),
        "evidence_id": str(analysis.evidence_id),
        "job_id": str(job_id),
        "model_name": analysis.model_name,
        "status": analysis.status,
        "result": analysis.result,
        "created_at": (
            analysis.created_at.isoformat()
            if analysis.created_at
            else None
        ),
    }


@router.post(
    "/{job_id}/evidence",
    response_model=EvidenceResponse,
)
async def upload_evidence(
    job_id: uuid.UUID,
    file: UploadFile = File(...),
    evidence_type: str = Form(...),
    latitude: float | None = Form(default=None),
    longitude: float | None = Form(default=None),
    captured_at: datetime | None = Form(default=None),
    checklist: str | None = Form(default=None),
    measurements: str | None = Form(default=None),
    description: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "technician":
        raise HTTPException(
            status_code=403,
            detail="Technician access required",
        )

    result = await db.execute(
        select(Job).where(
            Job.id == job_id,
            Job.technician_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found or not assigned to you",
        )

    evidence_type = evidence_type.strip().lower()
    evidence_type = EVIDENCE_TYPE_ALIASES.get(
        evidence_type,
        evidence_type,
    )

    if evidence_type not in {"before", "after"}:
        await file.close()
        raise HTTPException(
            status_code=400,
            detail="evidence_type must be before or after",
        )

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        await file.close()
        raise HTTPException(
            status_code=400,
            detail="Only JPEG, PNG, and WebP images are allowed",
        )

    if not file.filename:
        await file.close()
        raise HTTPException(
            status_code=400,
            detail="Uploaded file must have a filename",
        )

    parsed_checklist = None
    parsed_measurements = None

    if checklist:
        try:
            parsed_checklist = json.loads(checklist)
        except json.JSONDecodeError as exc:
            await file.close()
            raise HTTPException(
                status_code=400,
                detail="checklist must contain valid JSON",
            ) from exc

        if not isinstance(parsed_checklist, dict):
            await file.close()
            raise HTTPException(
                status_code=400,
                detail="checklist must be a JSON object",
            )

    if measurements:
        try:
            parsed_measurements = json.loads(measurements)
        except json.JSONDecodeError as exc:
            await file.close()
            raise HTTPException(
                status_code=400,
                detail="measurements must contain valid JSON",
            ) from exc

        if not isinstance(parsed_measurements, dict):
            await file.close()
            raise HTTPException(
                status_code=400,
                detail="measurements must be a JSON object",
            )

    image_bytes = bytearray()

    try:
        while True:
            chunk = await file.read(1024 * 1024)

            if not chunk:
                break

            image_bytes.extend(chunk)

            if len(image_bytes) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail="Image must be 10 MB or smaller",
                )
    finally:
        await file.close()

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty",
        )

    evidence_id = uuid.uuid4()
    cloudinary_public_id = None

    try:
        configure_cloudinary()

        upload_result = cloudinary.uploader.upload(
            io.BytesIO(image_bytes),
            resource_type="image",
            type="authenticated",
            folder="proof-of-work/evidence",
            public_id=str(evidence_id),
            overwrite=False,
            unique_filename=False,
        )
        cloudinary_public_id = upload_result["public_id"]

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Failed to upload evidence to cloud storage",
        ) from exc

    evidence = Evidence(
        id=evidence_id,
        job_id=job.id,
        technician_id=current_user.id,
        evidence_type=evidence_type,
        file_path=None,
        cloudinary_public_id=cloudinary_public_id,
        original_filename=file.filename,
        mime_type=file.content_type,
        file_size=len(image_bytes),
        latitude=latitude,
        longitude=longitude,
        captured_at=captured_at,
        checklist=parsed_checklist,
        measurements=parsed_measurements,
        description=description,
    )
    db.add(evidence)

    try:
        await db.commit()
        await db.refresh(evidence)

    except Exception as exc:
        await db.rollback()

        try:
            cloudinary.uploader.destroy(
                cloudinary_public_id,
                resource_type="image",
                type="authenticated",
            )
        except Exception:
            pass

        raise HTTPException(
            status_code=500,
            detail="Failed to save evidence record",
        ) from exc

    return evidence


@router.get(
    "/{job_id}/evidence",
    response_model=list[EvidenceResponse],
)
async def get_job_evidence(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await get_job_and_authorize(
        job_id,
        current_user,
        db,
        "view this job's evidence",
    )

    result = await db.execute(
        select(Evidence)
        .where(Evidence.job_id == job.id)
        .order_by(Evidence.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{job_id}/evidence/{evidence_id}/file")
async def get_evidence_file(
    job_id: uuid.UUID,
    evidence_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await get_job_and_authorize(
        job_id,
        current_user,
        db,
        "view this image",
    )

    result = await db.execute(
        select(Evidence).where(
            Evidence.id == evidence_id,
            Evidence.job_id == job.id,
        )
    )
    evidence = result.scalar_one_or_none()

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence not found",
        )

    if evidence.cloudinary_public_id:
        image_data = await load_evidence_image(evidence)

        return Response(
            content=image_data,
            media_type=evidence.mime_type,
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    if evidence.file_path:
        path = Path(evidence.file_path)

        if not path.is_file():
            raise HTTPException(
                status_code=404,
                detail="Evidence file is missing",
            )

        return FileResponse(
            path=path,
            media_type=evidence.mime_type,
            filename=evidence.original_filename,
            content_disposition_type="inline",
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    raise HTTPException(
        status_code=404,
        detail="Evidence file is missing",
    )


@router.post("/{job_id}/evidence/{evidence_id}/analyze")
async def analyze_job_evidence(
    job_id: uuid.UUID,
    evidence_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await get_job_and_authorize(
        job_id,
        current_user,
        db,
        "analyze this evidence",
    )

    result = await db.execute(
        select(Evidence).where(
            Evidence.id == evidence_id,
            Evidence.job_id == job.id,
        )
    )
    evidence = result.scalar_one_or_none()

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence not found",
        )

    image_data = await load_evidence_image(evidence)
    job_description = await get_job_description(job, db)

    try:
        analysis_result = await analyze_evidence_image(
            image_data=image_data,
            mime_type=evidence.mime_type,
            job_description=job_description,
        )
    except EvidenceAIError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "AI evidence analysis failed. Check model availability "
                "and server logs."
            ),
        ) from exc

    analysis = EvidenceAnalysis(
        evidence_id=evidence.id,
        model_name=settings.openrouter_model,
        status="completed",
        result=analysis_result,
    )
    db.add(analysis)

    try:
        await db.commit()
        await db.refresh(analysis)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to save evidence analysis",
        ) from exc

    return serialize_analysis(analysis, job.id)


@router.get("/{job_id}/evidence/{evidence_id}/analysis")
async def get_evidence_analysis(
    job_id: uuid.UUID,
    evidence_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await get_job_and_authorize(
        job_id,
        current_user,
        db,
        "view this analysis",
    )

    result = await db.execute(
        select(Evidence).where(
            Evidence.id == evidence_id,
            Evidence.job_id == job.id,
        )
    )
    evidence = result.scalar_one_or_none()

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence not found",
        )

    result = await db.execute(
        select(EvidenceAnalysis)
        .where(EvidenceAnalysis.evidence_id == evidence.id)
        .order_by(EvidenceAnalysis.created_at.desc())
        .limit(1)
    )
    analysis = result.scalar_one_or_none()

    if analysis is None:
        raise HTTPException(
            status_code=404,
            detail="No analysis found for this evidence",
        )

    return serialize_analysis(analysis, job.id)


@router.post("/{job_id}/evidence/compare")
async def compare_job_evidence(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compare uploaded BEFORE and AFTER images for a job."""
    job = await get_job_and_authorize(
        job_id,
        current_user,
        db,
        "compare this job's evidence",
    )
    job_description = await get_job_description(job, db)

    result = await db.execute(
        select(Evidence)
        .where(Evidence.job_id == job.id)
        .order_by(Evidence.created_at.asc())
    )
    all_evidence = result.scalars().all()

    before = [
        item
        for item in all_evidence
        if item.evidence_type.lower() in {"before", "before_service"}
    ]
    after = [
        item
        for item in all_evidence
        if item.evidence_type.lower() in {"after", "after_service"}
    ]

    if not before or not after:
        raise HTTPException(
            status_code=409,
            detail=(
                "Upload at least one before image and one after image "
                "before comparing."
            ),
        )

    # Reserve at least one slot for each group, then distribute
    # remaining slots without exceeding the model's image limit.
    before_limit = min(
        len(before),
        MAX_COMPARISON_IMAGES // 2,
    )
    after_limit = min(
        len(after),
        MAX_COMPARISON_IMAGES - before_limit,
    )
    before_limit = min(
        len(before),
        MAX_COMPARISON_IMAGES - after_limit,
    )

    selected_before = before[:before_limit]
    selected_after = after[:after_limit]

    if not selected_before or not selected_after:
        raise HTTPException(
            status_code=409,
            detail="At least one BEFORE and one AFTER image are required.",
        )

    before_images = []
    after_images = []

    for item in selected_before:
        before_images.append(
            {
                "image_data": await load_evidence_image(item),
                "mime_type": item.mime_type,
                "label": f"evidence {item.id}",
            }
        )

    for item in selected_after:
        after_images.append(
            {
                "image_data": await load_evidence_image(item),
                "mime_type": item.mime_type,
                "label": f"evidence {item.id}",
            }
        )

    try:
        comparison_result = await analyze_before_after_images(
            before_images=before_images,
            after_images=after_images,
            job_description=job_description,
        )
    except EvidenceAIError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "AI before/after comparison failed. Check model "
                "availability and server logs."
            ),
        ) from exc

    # Keep the report linked to an AFTER image for compatibility with
    # the existing EvidenceAnalysis model.
    anchor = selected_after[-1]
    comparison_result["analysis_type"] = "before_after_comparison"
    comparison_result["before_evidence_ids"] = [
        str(item.id) for item in selected_before
    ]
    comparison_result["after_evidence_ids"] = [
        str(item.id) for item in selected_after
    ]

    analysis = EvidenceAnalysis(
        evidence_id=anchor.id,
        model_name=settings.openrouter_model,
        status="completed",
        result=comparison_result,
    )
    db.add(analysis)

    try:
        await db.commit()
        await db.refresh(analysis)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to save comparison report",
        ) from exc

    response = serialize_analysis(analysis, job.id)
    response["analysis_type"] = "before_after_comparison"
    response["before_evidence_ids"] = comparison_result["before_evidence_ids"]
    response["after_evidence_ids"] = comparison_result["after_evidence_ids"]

    return response

@router.get("/{job_id}/evidence/comparison")
async def get_job_comparison_report(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the latest saved before/after comparison for a job."""
    job = await get_job_and_authorize(
        job_id,
        current_user,
        db,
        "view this job's comparison report",
    )

    result = await db.execute(
        select(Evidence.id).where(Evidence.job_id == job.id)
    )
    evidence_ids = result.scalars().all()

    if not evidence_ids:
        raise HTTPException(
            status_code=404,
            detail="No evidence has been uploaded for this job",
        )

    result = await db.execute(
        select(EvidenceAnalysis)
        .where(EvidenceAnalysis.evidence_id.in_(evidence_ids))
        .order_by(EvidenceAnalysis.created_at.desc())
    )
    analyses = result.scalars().all()

    for analysis in analyses:
        analysis_result = analysis.result or {}

        if analysis_result.get("analysis_type") == "before_after_comparison":
            response = serialize_analysis(analysis, job.id)
            response["analysis_type"] = "before_after_comparison"
            response["before_evidence_ids"] = analysis_result.get(
                "before_evidence_ids", []
            )
            response["after_evidence_ids"] = analysis_result.get(
                "after_evidence_ids", []
            )
            return response

    raise HTTPException(
        status_code=404,
        detail="No comparison report exists for this job yet",
    )


