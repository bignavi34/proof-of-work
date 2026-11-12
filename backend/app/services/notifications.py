
import asyncio
import base64
import html
import logging
from email.message import EmailMessage
from email.utils import make_msgid

from google.auth.transport.requests import AuthorizedSession
from google.oauth2.credentials import Credentials

from app.core.config import settings


logger = logging.getLogger(__name__)

GMAIL_SEND_URL = (
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
)

GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send"


class EmailDeliveryError(Exception):
    """Raised when Gmail API cannot accept an email."""


def _send_gmail_email(
    *,
    recipient_email: str,
    subject: str,
    body: str,
) -> str:

    if not all([
        settings.gmail_client_id,
        settings.gmail_client_secret,
        settings.gmail_refresh_token,
        settings.gmail_sender_email,
    ]):
        raise EmailDeliveryError(
            "Gmail API credentials are not configured."
        )

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

    message["From"] = (
        f"Proof of Work <{settings.gmail_sender_email}>"
    )
    message["To"] = recipient_email
    message["Subject"] = subject
    message["Message-ID"] = make_msgid()

    message.set_content(body)
    message.add_alternative(safe_html, subtype="html")

    try:
        credentials = Credentials(
            token=None,
            refresh_token=settings.gmail_refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.gmail_client_id,
            client_secret=settings.gmail_client_secret,
            scopes=[GMAIL_SCOPE],
        )

        # AuthorizedSession automatically refreshes expired
        # access tokens using the stored refresh token.
        session = AuthorizedSession(credentials)

        raw_message = base64.urlsafe_b64encode(
            message.as_bytes()
        ).decode("utf-8")

        response = session.post(
            GMAIL_SEND_URL,
            json={"raw": raw_message},
            timeout=30,
        )

        response.raise_for_status()

        result = response.json()
        gmail_message_id = result.get("id")

        if not gmail_message_id:
            raise EmailDeliveryError(
                "Gmail API returned no message ID."
            )

        logger.info(
            "Email accepted by Gmail API. message_id=%s",
            gmail_message_id,
        )

        return gmail_message_id

    except EmailDeliveryError:
        raise

    except Exception as exc:
        logger.exception("Gmail API email delivery failed.")

        raise EmailDeliveryError(
            "Gmail API failed to accept the email."
        ) from exc

    finally:
        if "session" in locals():
            session.close()


async def send_email(
    *,
    recipient_email: str,
    subject: str,
    body: str,
) -> str:
    """
    Send one transactional email through Gmail API.

    Returns the Gmail API message ID.
    """

    recipient_email = recipient_email.strip()

    if not recipient_email or len(recipient_email) > 320:
        raise EmailDeliveryError(
            "Invalid recipient email address."
        )

    if (
        not subject.strip()
        or len(subject) > 180
        or "\r" in subject
        or "\n" in subject
    ):
        raise EmailDeliveryError(
            "Invalid email subject."
        )

    if not body.strip() or len(body) > 6000:
        raise EmailDeliveryError(
            "Invalid email body."
        )

    try:
        return await asyncio.to_thread(
            _send_gmail_email,
            recipient_email=recipient_email,
            subject=subject,
            body=body,
        )

    except EmailDeliveryError:
        raise

    except Exception as exc:
        logger.exception(
            "Unexpected Gmail API delivery error."
        )

        raise EmailDeliveryError(
            "Unexpected Gmail API delivery failure."
        ) from exc

