import html
import logging

import resend

from app.core.config import settings


logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    """Raised when an email cannot be delivered through Resend."""


async def send_email(
    *,
    recipient_email: str,
    subject: str,
    body: str,
) -> str:
    """
    Send one transactional email.

    Returns the Resend email ID.
    """

    if not settings.resend_api_key:
        raise EmailDeliveryError("Resend API key is not configured.")

    if not settings.email_from:
        raise EmailDeliveryError("Email sender address is not configured.")

    recipient_email = recipient_email.strip()

    if not recipient_email or len(recipient_email) > 320:
        raise EmailDeliveryError("Invalid recipient email address.")

    if not subject.strip() or len(subject) > 180:
        raise EmailDeliveryError("Invalid email subject.")

    if not body.strip() or len(body) > 6000:
        raise EmailDeliveryError("Invalid email body.")

    paragraphs = [
        f"<p>{html.escape(paragraph)}</p>"
        for paragraph in body.split("\n\n")
        if paragraph.strip()
    ]

    safe_html = f"""
    <div style="font-family: Arial, sans-serif;
                line-height: 1.6; color: #222;">
        {''.join(paragraphs)}
        <p style="margin-top: 28px;">
            Regards,<br>
            <strong>Proof of Work Team</strong>
        </p>
    </div>
    """

    resend.api_key = settings.resend_api_key

    try:
        result = await resend.Emails.send_async(
            {
                "from": settings.email_from,
                "to": [recipient_email],
                "subject": subject,
                "text": body,
                "html": safe_html,
            }
        )

        email_id = result.get("id") if isinstance(result, dict) else None

        if not email_id:
            raise EmailDeliveryError(
                "Resend did not return an email ID."
            )

        logger.info(
            "Completion email accepted by Resend. email_id=%s",
            email_id,
        )

        return email_id

    except EmailDeliveryError:
        raise
    except Exception as exc:
        logger.exception("Resend email delivery failed.")

        raise EmailDeliveryError(
            "Resend failed to accept the email."
        ) from exc
