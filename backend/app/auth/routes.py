from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.admin_access import AdminAccess
from app.models.technician_access import TechnicianAccess
from app.models.user import User
from app.models.user_credential import UserCredential
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
class PasswordLoginRequest(BaseModel):
    email: EmailStr
    password: str
    login_mode: Literal["user", "technician", "admin"] = "user"
class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
password_hasher = PasswordHash.recommended()

# Used to make unknown accounts follow a similar password-verification path.
dummy_password_hash = password_hasher.hash(
    "not-a-real-user-password"
    )

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
@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    name = payload.name.strip()
    email = str(payload.email).lower().strip()

    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Name is required.",
        )

    # Public signup is exclusively for customer accounts.
    existing_result = await db.execute(
        select(User).where(User.email == email)
    )
    existing_user = existing_result.scalar_one_or_none()

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists. Please sign in.",
        )

    user = User(
        email=email,
        name=name,
        avatar_url=None,
        auth_provider="password",
        provider_user_id=email,
        role="customer",
    )

    credential = UserCredential(
        user_id=user.id,
        password_hash=password_hasher.hash(payload.password),
    )

    try:
        db.add(user)
        await db.flush()

        credential.user_id = user.id
        db.add(credential)

        await db.commit()
        await db.refresh(user)

    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists. Please sign in.",
        ) from None

    # Sign the new customer in.
    request.session.clear()
    request.session["user_id"] = str(user.id)

    return {
        "message": "Account created successfully",
        "redirect_to": "/customer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "auth_provider": user.auth_provider,
            "role": user.role,
        },
    }
@router.post("/password/login")
async def password_login(
    payload: PasswordLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    email = str(payload.email).lower().strip()

    # Find an existing account.
    user_result = await db.execute(
        select(User).where(User.email == email)
    )
    user = user_result.scalar_one_or_none()

    credential = None

    if user is not None:
        credential_result = await db.execute(
            select(UserCredential).where(
                UserCredential.user_id == user.id
            )
        )
        credential = credential_result.scalar_one_or_none()

    # Verify the password without revealing whether an account exists.
    stored_hash = (
        credential.password_hash
        if credential is not None
        else dummy_password_hash
    )

    password_valid = password_hasher.verify(
        payload.password,
        stored_hash,
    )

    if user is None or credential is None or not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Check whether this account is authorized for privileged login.
    admin_result = await db.execute(
        select(AdminAccess).where(
            AdminAccess.email == email,
            AdminAccess.revoked_at.is_(None),
        )
    )
    admin_access = admin_result.scalar_one_or_none()

    technician_result = await db.execute(
        select(TechnicianAccess).where(
            TechnicianAccess.email == email,
            TechnicianAccess.revoked_at.is_(None),
        )
    )
    technician_access = technician_result.scalar_one_or_none()

    # Apply the same role restrictions as Google OAuth.
    if payload.login_mode == "admin":
        if admin_access is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Administrator access is required.",
            )
        user.role = "company_admin"

    elif payload.login_mode == "technician":
        if technician_access is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Technician access is required.",
            )
        user.role = "technician"

    else:
        if admin_access is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Please use Admin Login for this account.",
            )

        if technician_access is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Please use Technician Login for this account.",
            )

        user.role = "customer"

    await db.commit()
    await db.refresh(user)

    # Establish the authenticated session.
    request.session.clear()
    request.session["user_id"] = str(user.id)

    destinations = {
        "user": "/customer",
        "technician": "/technician",
        "admin": "/admin",
    }

    return {
        "message": "Login successful",
        "redirect_to": destinations[payload.login_mode],
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "auth_provider": user.auth_provider,
            "role": user.role,
        },
    }


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()

    return {"message": "Logged out successfully"}

