
import logging

import razorpay

from app.core.config import settings

logger = logging.getLogger(__name__)


def _get_client() -> razorpay.Client:
    key_id = settings.razorpay_key_id
    key_secret = settings.razorpay_key_secret

    if not key_id or not key_secret:
        raise RuntimeError("Razorpay credentials are not configured")

    # Prevent accidental use of live credentials during development.
    if not key_id.startswith("rzp_test_"):
        raise RuntimeError(
            "Razorpay Test Mode credentials are required"
        )

    if settings.razorpay_currency != "INR":
        raise RuntimeError("Only INR payments are supported")

    return razorpay.Client(auth=(key_id, key_secret))


def create_order(*, amount_paise: int, receipt: str) -> dict:
    """Create an order with a trusted server-calculated amount."""
    if amount_paise <= 0:
        raise ValueError("Payment amount must be positive")

    client = _get_client()
    return client.order.create(
        {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
        }
    )


def verify_checkout_signature(
    *,
    order_id: str,
    payment_id: str,
    signature: str,
) -> bool:
    """Verify the Razorpay Checkout signature."""
    if not order_id or not payment_id or not signature:
        return False

    client = _get_client()

    try:
        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature,
            }
        )
        return True
    except razorpay.errors.SignatureVerificationError:
        return False
    except Exception:
        logger.exception("Razorpay signature verification failed")
        raise


def fetch_payment(payment_id: str) -> dict:
    """Retrieve payment status directly from Razorpay."""
    if not payment_id:
        raise ValueError("Payment ID is required")

    client = _get_client()
    return client.payment.fetch(payment_id)

