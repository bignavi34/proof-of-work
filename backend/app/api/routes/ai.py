
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.dependencies import get_current_admin
from app.auth.dependencies import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services.work_search_ai import (
    WorkSearchAIError,
    answer_work_question,
)

router = APIRouter(prefix="/ai", tags=["AI work search"])


class WorkSearchRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class WorkSearchResponse(BaseModel):
    answer: str
    tool_calls_made: int
    model: str


@router.post("/search", response_model=WorkSearchResponse)
async def search_work(
    payload: WorkSearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # The admin dependency checks the actual AdminAccess grant.
    from app.models.admin_access import AdminAccess
    from sqlalchemy import func, select

    result = await db.execute(
        select(AdminAccess.id).where(
            func.lower(AdminAccess.email) == current_user.email.lower(),
            AdminAccess.revoked_at.is_(None),
        )
    )
    is_admin = result.scalar_one_or_none() is not None

    if not is_admin and current_user.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI work search is currently available to customers and administrators.",
        )

    try:
        return await answer_work_question(
            question=payload.question,
            db=db,
            user=current_user,
            is_admin=is_admin,
        )
    except WorkSearchAIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

