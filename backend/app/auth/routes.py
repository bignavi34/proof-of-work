from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.admin_access import AdminAccess
from app.models.technician_access import TechnicianAccess
from app.users.service import get_or_create_google_user


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


def get_frontend_url() -> str:
    """Return the frontend URL for the current environment."""
    return getattr(
        settings,
        "frontend_url",
        "http://localhost:5173",
    ).rstrip("/")


@router.get("/google/login")
async def google_login(request: Request):
    request.session["login_mode"] = "user"

    redirect_uri = request.url_for("google_callback")

    return await request.app.state.oauth.google.authorize_redirect(
        request,
        redirect_uri,
    )


@router.get("/google/admin-login")
async def google_admin_login(request: Request):
    request.session["login_mode"] = "admin"

    redirect_uri = request.url_for("google_callback")

    return await request.app.state.oauth.google.authorize_redirect(
        request,
        redirect_uri,
    )


@router.get("/google/technician-login")
async def google_technician_login(request: Request):
    request.session["login_mode"] = "technician"

    redirect_uri = request.url_for("google_callback")

    return await request.app.state.oauth.google.authorize_redirect(
        request,
        redirect_uri,
    )


@router.get("/google/callback", name="google_callback")
async def google_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    frontend_url = get_frontend_url()
    login_mode = request.session.get("login_mode", "user")

    token = await request.app.state.oauth.google.authorize_access_token(
        request
    )

    userinfo = token["userinfo"]
    google_email = userinfo["email"].lower().strip()

    # Check admin access.
    admin_result = await db.execute(
        select(AdminAccess).where(
            AdminAccess.email == google_email,
            AdminAccess.revoked_at.is_(None),
        )
    )
    admin_access = admin_result.scalar_one_or_none()

    # Check technician access.
    technician_result = await db.execute(
        select(TechnicianAccess).where(
            TechnicianAccess.email == google_email,
            TechnicianAccess.revoked_at.is_(None),
        )
    )
    technician_access = technician_result.scalar_one_or_none()

    # Validate the selected login mode.
    if login_mode == "admin" and admin_access is None:
        request.session.clear()
        return RedirectResponse(
            url=f"{frontend_url}/login?error=admin_access_required",
            status_code=302,
        )

    if login_mode == "technician" and technician_access is None:
        request.session.clear()
        return RedirectResponse(
            url=f"{frontend_url}/login?error=technician_access_required",
            status_code=302,
        )

    if login_mode == "user":
        if admin_access is not None:
            request.session.clear()
            return RedirectResponse(
                url=f"{frontend_url}/login?error=admin_use_admin_login",
                status_code=302,
            )

        if technician_access is not None:
            request.session.clear()
            return RedirectResponse(
                url=(
                    f"{frontend_url}/login"
                    "?error=technician_use_technician_login"
                ),
                status_code=302,
            )

    # Get or create the user.
    user = await get_or_create_google_user(
        db,
        google_sub=userinfo["sub"],
        email=google_email,
        name=userinfo.get("name") or "",
        avatar_url=userinfo.get("picture"),
    )

    # Assign the role for this login.
    if login_mode == "admin":
        user.role = "company_admin"
    elif login_mode == "technician":
        user.role = "technician"
    else:
        user.role = "customer"

    await db.commit()
    await db.refresh(user)

    # Create the authenticated session.
    request.session.pop("login_mode", None)
    request.session["user_id"] = str(user.id)

    # Redirect to the deployed frontend route.
    if login_mode == "admin":
        destination = f"{frontend_url}/admin"
    elif login_mode == "technician":
        destination = f"{frontend_url}/technician"
    else:
        destination = f"{frontend_url}/customer"

    return RedirectResponse(
        url=destination,
        status_code=302,
    )


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()

    return {"message": "Logged out successfully"}

