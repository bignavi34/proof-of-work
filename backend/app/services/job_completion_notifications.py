import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.models.evidence import Evidence
from app.models.evidence_analysis import EvidenceAnalysis
from app.models.job import Job
from app.models.job_notification import JobNotification
from app.services.email_ai import generate_job_completion_email
from app.services.notifications import send_email

logger = logging.getLogger(__name__)


def _safe_evidence_context(evidence: Evidence) -> dict[str, Any]:
    """Include useful work details, never private file URLs or GPS coordinates."""
    return {
        "evidence_type": evidence.evidence_type,
        "description": evidence.description,
        "captured_at": (
            evidence.captured_at.isoformat()
            if evidence.captured_at
            else None
        ),
        "checklist": evidence.checklist,
        "measurements": evidence.measurements,
    }



async def process_job_completion_notifications(
    notification_ids: list[UUID],
    engine: AsyncEngine,
) -> None:
    """
    Process committed notification records after job completion.
    Each notification gets its own database session.
    """
    session_factory = async_sessionmaker(
        bind=engine,
        expire_on_commit=False,
    )

    for notification_id in notification_ids:
        async with session_factory() as db:
            notification = await db.get(
                JobNotification,
                notification_id,
            )

            if notification is None or notification.status != "pending":
                continue

            try:
                job = await db.get(Job, notification.job_id)

                if job is None:
                    raise ValueError(
                        "The associated job no longer exists."
                    )

                evidence_result = await db.execute(
                    select(Evidence).where(
                        Evidence.job_id == job.id
                    )
                )
                evidence_items = evidence_result.scalars().all()

                analysis_result = await db.execute(
                    select(EvidenceAnalysis)
                    .join(
                        Evidence,
                        EvidenceAnalysis.evidence_id == Evidence.id,
                    )
                    .where(Evidence.job_id == job.id)
                )
                analyses = analysis_result.scalars().all()

                job_context = {
                    "job_id": str(job.id),
                    "job_status": job.status,
                    "evidence_count": len(evidence_items),
                    "evidence": [
                        _safe_evidence_context(item)
                        for item in evidence_items
                    ],
                    "evidence_analysis": [
                        {
                            "status": item.status,
                            "result": item.result,
                        }
                        for item in analyses
                    ],
                }

                email_content = await generate_job_completion_email(
                    recipient_name=notification.recipient_name,
                    recipient_role=(
                        "customer"
                        if notification.notification_type
                        == "job_completed_customer"
                        else "technician"
                    ),
                    job_context=job_context,
                )

                notification.subject = email_content["subject"]
                notification.body = email_content["body"]
                await db.commit()

                email_message_id = await send_email(
                    recipient_email=notification.recipient_email,
                    subject=email_content["subject"],
                    body=email_content["body"],
                )

                notification.resend_email_id = email_message_id
                notification.status = "sent"
                notification.sent_at = datetime.now(timezone.utc)
                notification.error_message = None

                await db.commit()

                logger.info(
                    "Job notification accepted by Gmail API: "
                    "notification_id=%s",
                    notification.id,
                )

            except Exception as exc:
                logger.exception(
                    "Job completion notification failed: "
                    "notification_id=%s",
                    notification_id,
                )

                await db.rollback()

                failed_notification = await db.get(
                    JobNotification,
                    notification_id,
                )

                if failed_notification is not None:
                    failed_notification.status = "failed"
                    failed_notification.error_message = str(exc)[:2000]
                    await db.commit()
