import asyncio
import html
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import make_msgid, parseaddr
from app.core.config import settings


logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    """Raised when SMTP cannot accept an email."""


def _send_smtp_email(
    *,
    recipient_email: str,
    subject: str,
    body: str,
) -> str:
    if not settings.smtp_username or not settings.smtp_password:
        raise EmailDeliveryError("SMTP credentials are not configured.")

    sender_email = parseaddr(settings.email_from)[1]

    if not sender_email:
        raise EmailDeliveryError("Invalid email sender address.")

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

    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = recipient_email
    message["Message-ID"] = make_msgid()
    message.set_content(body)
    message.add_alternative(safe_html, subtype="html")

    try:
        context = ssl.create_default_context()

        with smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=30,
        ) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()

            server.login(
                settings.smtp_username,
                settings.smtp_password,
            )

            refused = server.send_message(
                message,
                from_addr=sender_email,
                to_addrs=[recipient_email],
            )

            if refused:
                raise EmailDeliveryError(
                    "SMTP server refused the recipient."
                )

        email_id = message["Message-ID"]

        logger.info(
            "Completion email accepted by SMTP server. message_id=%s",
            email_id,
        )

        return email_id

    except EmailDeliveryError:
        raise
    except Exception as exc:
        logger.exception("SMTP email delivery failed.")

        raise EmailDeliveryError(
            "SMTP server failed to accept the email."
        ) from exc


async def send_email(
    *,
    recipient_email: str,
    subject: str,
    body: str,
) -> str:
    """
    Send one transactional email through Gmail SMTP.

    Returns the generated email Message-ID.
    """

    recipient_email = recipient_email.strip()

    if not recipient_email or len(recipient_email) > 320:
        raise EmailDeliveryError("Invalid recipient email address.")

    if (
        not subject.strip()
        or len(subject) > 180
        or "\r" in subject
        or "\n" in subject
    ):
        raise EmailDeliveryError("Invalid email subject.")

    if not body.strip() or len(body) > 6000:
        raise EmailDeliveryError("Invalid email body.")

    try:
        return await asyncio.to_thread(
            _send_smtp_email,
            recipient_email=recipient_email,
            subject=subject,
            body=body,
        )
    except EmailDeliveryError:
        raise
    except Exception as exc:
        logger.exception("Unexpected SMTP delivery error.")

        raise EmailDeliveryError(
            "Unexpected SMTP delivery failure."
        ) from exc

