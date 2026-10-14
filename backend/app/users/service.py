from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_or_create_google_user(
    db: AsyncSession,
    *,
    google_sub: str,
    email: str,
    name: str,
    avatar_url: str | None,
) -> User:
    result = await db.execute(
        select(User).where(
            User.auth_provider == "google",
            User.provider_user_id == google_sub,
        )
    )

    user = result.scalar_one_or_none()

    if user is not None:
        user.email = email
        user.name = name
        user.avatar_url = avatar_url

        await db.commit()
        await db.refresh(user)

        return user

    user = User(
        email=email,
        name=name,
        avatar_url=avatar_url,
        auth_provider="google",
        provider_user_id=google_sub,
    )

    db.add(user)

    await db.commit()
    await db.refresh(user)

    return user
