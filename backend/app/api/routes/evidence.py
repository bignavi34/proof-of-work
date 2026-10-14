
import io
import json
import uuid
from datetime import datetime
from pathlib import Path
from app.models.service_request import ServiceRequest
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
from app.models.evidence_analysis import EvidenceAnalysis
from app.services.evidence_ai import (
    EvidenceAIError,
    analyze_evidence_image,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.admin_access import AdminAccess
from app.models.technician_access import TechnicianAccess
from app.models.evidence import Evidence
from app.models.job import Job
from app.models.user import User
from app.schemas.evidence import EvidenceResponse


router = APIRouter(
    prefix="/jobs",
    tags=["Evidence"],
)

UPLOAD_DIRECTORY = Path("uploads/evidence")
MAX_FILE_SIZE = 10 * 1024 * 1024

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
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
    """Check whether the current user can access a job's evidence."""
    if job.customer_id == current_user.id:
        return True

    if current_user.role == "technician":
        access_result = await db.execute(
            select(TechnicianAccess).where(
                TechnicianAccess.email == current_user.email,
                TechnicianAccess.revoked_at.is_(None),
            )
        )

        has_technician_access = (
            access_result.scalar_one_or_none() is not None
        )

        if (
            job.technician_id == current_user.id
            and has_technician_access
        ):
            return True

    if current_user.role == "company_admin":
        admin_result = await db.execute(
            select(AdminAccess).where(
                AdminAccess.email == current_user.email,
                AdminAccess.revoked_at.is_(None),
            )
        )

        return admin_result.scalar_one_or_none() is not None

    return False


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
    # Only technicians can upload evidence.
    if current_user.role != "technician":
        raise HTTPException(
            status_code=403,
            detail="Technician access required",
        )

    # Verify that the job is assigned to this technician.
    job_result = await db.execute(
        select(Job).where(
            Job.id == job_id,
            Job.technician_id == current_user.id,
        )
    )
    job = job_result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found or not assigned to you",
        )

    # Validate the uploaded image.
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

    # Parse and validate JSON fields.
    parsed_checklist = None
    parsed_measurements = None

    if checklist:
        try:
            parsed_checklist = json.loads(checklist)
        except json.JSONDecodeError:
            await file.close()
            raise HTTPException(
                status_code=400,
                detail="checklist must contain valid JSON",
            )

        if not isinstance(parsed_checklist, dict):
            await file.close()
            raise HTTPException(
                status_code=400,
                detail="checklist must be a JSON object",
            )

    if measurements:
        try:
            parsed_measurements = json.loads(measurements)
        except json.JSONDecodeError:
            await file.close()
            raise HTTPException(
                status_code=400,
                detail="measurements must contain valid JSON",
            )

        if not isinstance(parsed_measurements, dict):
            await file.close()
            raise HTTPException(
                status_code=400,
                detail="measurements must be a JSON object",
            )

    # Read the image while enforcing the size limit.
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

    # Upload the image as an authenticated Cloudinary asset.
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

    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Failed to upload evidence to cloud storage",
        )

    # Save metadata. New evidence uses Cloudinary, not local storage.
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

    except Exception:
        await db.rollback()

        # Avoid leaving an orphaned Cloudinary asset when possible.
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
        )

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
    job_result = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = job_result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    if not await user_can_access_job(job, current_user, db):
        raise HTTPException(
            status_code=403,
            detail="You are not allowed to view this job's evidence",
        )

    evidence_result = await db.execute(
        select(Evidence)
        .where(Evidence.job_id == job.id)
        .order_by(Evidence.created_at.desc())
    )

    return evidence_result.scalars().all()


@router.get("/{job_id}/evidence/{evidence_id}/file")
async def get_evidence_file(
    job_id: uuid.UUID,
    evidence_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job_result = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = job_result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    # Authorize before retrieving any file from storage.
    if not await user_can_access_job(job, current_user, db):
        raise HTTPException(
            status_code=403,
            detail="You are not allowed to view this image",
        )

    evidence_result = await db.execute(
        select(Evidence).where(
            Evidence.id == evidence_id,
            Evidence.job_id == job.id,
        )
    )
    evidence = evidence_result.scalar_one_or_none()

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence not found",
        )

    # New evidence: retrieve the authenticated Cloudinary asset.
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
                remote_response = await client.get(signed_url)

            if remote_response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail="Unable to retrieve evidence from cloud storage",
                )

            return Response(
                content=remote_response.content,
                media_type=evidence.mime_type,
                headers={
                    "Cache-Control": "private, no-store",
                    "X-Content-Type-Options": "nosniff",
                },
            )

        except HTTPException:
            raise

        except Exception:
            raise HTTPException(
                status_code=502,
                detail="Unable to retrieve evidence from cloud storage",
            )

    # Legacy evidence: serve files already stored locally.
    if evidence.file_path:
        file_path = Path(evidence.file_path)

        if not file_path.is_file():
            raise HTTPException(
                status_code=404,
                detail="Evidence file is missing",
            )

        return FileResponse(
            path=file_path,
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
    # 1. Find the job.
    job_result = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = job_result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    # 2. Check access before retrieving or analyzing the image.
    if not await user_can_access_job(job, current_user, db):
        raise HTTPException(
            status_code=403,
            detail="You are not allowed to analyze this evidence",
        )

    # 3. Load the original customer service request.
    service_request_result = await db.execute(
        select(ServiceRequest).where(
            ServiceRequest.id == job.service_request_id
        )
    )
    service_request = service_request_result.scalar_one_or_none()

    if service_request is None:
        raise HTTPException(
            status_code=404,
            detail="Service request associated with this job was not found",
        )

    # 4. Find evidence belonging to this job.
    evidence_result = await db.execute(
        select(Evidence).where(
            Evidence.id == evidence_id,
            Evidence.job_id == job_id,
        )
    )
    evidence = evidence_result.scalar_one_or_none()

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence not found",
        )

    if evidence.mime_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported evidence image type",
        )

    # 5. Retrieve the image from private Cloudinary storage,
    # or use a legacy local file if one exists.
    image_data: bytes

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
                image_response = await client.get(signed_url)

            if image_response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail="Unable to retrieve evidence image",
                )

            image_data = image_response.content

        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=502,
                detail="Unable to retrieve evidence image",
            )

    elif evidence.file_path:
        file_path = Path(evidence.file_path)

        if not file_path.is_file():
            raise HTTPException(
                status_code=404,
                detail="Evidence image is missing",
            )

        try:
            image_data = file_path.read_bytes()
        except OSError:
            raise HTTPException(
                status_code=500,
                detail="Unable to read evidence image",
            )

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

    # 6. Analyze the image against the actual service request.
    job_description = (
        f"Service type: {service_request.service_type}\n"
        f"Customer's requested work: {service_request.description}"
    )

    try:
        analysis_result = await analyze_evidence_image(
            image_data=image_data,
            mime_type=evidence.mime_type,
            job_description=job_description,
        )
    except EvidenceAIError:
        raise HTTPException(
            status_code=502,
            detail=(
                "AI evidence analysis failed. "
                "Check model availability and server logs."
            ),
        )

    # 7. Save the analysis separately from the evidence record.
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
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to save evidence analysis",
        )

    # 8. Return the saved analysis.
    return {
        "id": str(analysis.id),
        "evidence_id": str(evidence.id),
        "job_id": str(job.id),
        "model_name": analysis.model_name,
        "status": analysis.status,
        "result": analysis.result,
        "created_at": analysis.created_at.isoformat(),
    }

@router.get(
    "/{job_id}/evidence/{evidence_id}/analysis"
)
async def get_evidence_analysis(
    job_id: uuid.UUID,
    evidence_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 1. Find the job.
    job_result = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = job_result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    # 2. Check whether the user can access this job.
    if not await user_can_access_job(job, current_user, db):
        raise HTTPException(
            status_code=403,
            detail="You are not allowed to view this analysis",
        )

    # 3. Verify that the evidence belongs to this job.
    evidence_result = await db.execute(
        select(Evidence).where(
            Evidence.id == evidence_id,
            Evidence.job_id == job_id,
        )
    )
    evidence = evidence_result.scalar_one_or_none()

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence not found",
        )

    # 4. Retrieve the most recent saved analysis.
    analysis_result = await db.execute(
        select(EvidenceAnalysis)
        .where(EvidenceAnalysis.evidence_id == evidence.id)
        .order_by(EvidenceAnalysis.created_at.desc())
        .limit(1)
    )
    analysis = analysis_result.scalar_one_or_none()

    if analysis is None:
        raise HTTPException(
            status_code=404,
            detail="No analysis found for this evidence",
        )

    # 5. Return the saved result without calling the AI.
    return {
        "id": str(analysis.id),
        "evidence_id": str(evidence.id),
        "job_id": str(job.id),
        "model_name": analysis.model_name,
        "status": analysis.status,
        "result": analysis.result,
        "created_at": analysis.created_at.isoformat(),
    }

