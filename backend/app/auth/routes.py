from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.oauth import oauth
from app.core.database import get_db
from app.models.admin_access import AdminAccess
from app.models.technician_access import TechnicianAccess

from app.models.user import User
from app.users.service import get_or_create_google_user


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.get("/google/login")
async def google_login(
    request: Request,
):
    request.session["login_mode"] = "user"

    redirect_uri = request.url_for("google_callback")

    return await request.app.state.oauth.google.authorize_redirect(
        request,
        redirect_uri,
    )


@router.get("/google/admin-login")
async def google_admin_login(
    request: Request,
):
    request.session["login_mode"] = "admin"

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
    login_mode = request.session.get("login_mode", "user")

    token = await request.app.state.oauth.google.authorize_access_token(
        request
    )

    userinfo = token["userinfo"]

    google_email = userinfo["email"].lower().strip()

    # ---------------------------------------------------------
    # CHECK ADMIN ACCESS
    # ---------------------------------------------------------
    admin_result = await db.execute(
        select(AdminAccess).where(
            AdminAccess.email == google_email,
            AdminAccess.revoked_at.is_(None),
        )
    )

    admin_access = admin_result.scalar_one_or_none()

    # ---------------------------------------------------------
    # CHECK TECHNICIAN ACCESS
    # ---------------------------------------------------------
    technician_result = await db.execute(
        select(TechnicianAccess).where(
            TechnicianAccess.email == google_email,
            TechnicianAccess.revoked_at.is_(None),
        )
    )

    technician_access = technician_result.scalar_one_or_none()

    # ---------------------------------------------------------
    # ADMIN LOGIN
    # ---------------------------------------------------------
    if login_mode == "admin":
        if admin_access is None:
            request.session.clear()

            return RedirectResponse(
                url=(
                    "http://localhost:5173/login"
                    "?error=admin_access_required"
                ),
                status_code=302,
            )

    # ---------------------------------------------------------
    # TECHNICIAN LOGIN
    # ---------------------------------------------------------
    elif login_mode == "technician":
        if technician_access is None:
            request.session.clear()

            return RedirectResponse(
                url=(
                    "http://localhost:5173/login"
                    "?error=technician_access_required"
                ),
                status_code=302,
            )

    # ---------------------------------------------------------
    # NORMAL USER LOGIN
    # ---------------------------------------------------------
    elif login_mode == "user":
        if admin_access is not None:
            request.session.clear()

            return RedirectResponse(
                url=(
                    "http://localhost:5173/login"
                    "?error=admin_use_admin_login"
                ),
                status_code=302,
            )

        if technician_access is not None:
            request.session.clear()

            return RedirectResponse(
                url=(
                    "http://localhost:5173/login"
                    "?error=technician_use_technician_login"
                ),
                status_code=302,
            )

    # ---------------------------------------------------------
    # GET OR CREATE USER
    # ---------------------------------------------------------
    user = await get_or_create_google_user(
        db,
        google_sub=userinfo["sub"],
        email=google_email,
        name=userinfo.get("name") or "",
        avatar_url=userinfo.get("picture"),
    )

    # ---------------------------------------------------------
    # SET ROLE
    # ---------------------------------------------------------
    if login_mode == "admin":
        user.role = "company_admin"

    elif login_mode == "technician":
        user.role = "technician"

    else:
        user.role = "customer"

    await db.commit()
    await db.refresh(user)

    # ---------------------------------------------------------
    # CREATE SESSION
    # ---------------------------------------------------------
    request.session.pop("login_mode", None)
    request.session["user_id"] = str(user.id)

    # ---------------------------------------------------------
    # REDIRECT
    # ---------------------------------------------------------
    if login_mode == "admin":
        return RedirectResponse(
            url="http://localhost:5173/admin",
            status_code=302,
        )

    if login_mode == "technician":
        return RedirectResponse(
            url="http://localhost:5173/technician",
            status_code=302,
        )

    return RedirectResponse(
        url="http://localhost:5173/customer",
        status_code=302,
    )
@router.get("/google/technician-login")
async def google_technician_login(
    request: Request,
):
    request.session["login_mode"] = "technician"

    redirect_uri = request.url_for("google_callback")

    return await request.app.state.oauth.google.authorize_redirect(
        request,
        redirect_uri,
    )
@router.post("/logout")
async def logout(request: Request):
    request.session.clear()

    return {
        "message": "Logged out successfully",
    }
