from fastapi import HTTPException, status

from app.models.user import User


def require_role(
    user: User,
    *roles: str,
) -> User:
    if user.role not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    return user
