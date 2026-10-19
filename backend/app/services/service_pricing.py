from types import MappingProxyType


# Prices are in paise, the smallest INR currency unit.
SERVICE_PRICES_PAISE = MappingProxyType(
    {
        "AC Cleaning": 79_900,
        "AC Repair": 149_900,
    }
)


def get_service_price_paise(service_type: str) -> int:
    """Return the trusted fixed price for a supported service type."""
    try:
        return SERVICE_PRICES_PAISE[service_type.strip()]
    except KeyError:
        raise ValueError(
            f"Unsupported service type: {service_type}"
        ) from None

