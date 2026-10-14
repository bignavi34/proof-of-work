from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from app.api.routes.evidence import router as evidence_router
from app.admin.routes import router as admin_router
from app.api.routes.service_requests import (
    router as service_requests_router,
)
from app.api.routes.jobs import router as jobs_router
from app.auth.oauth import oauth
from app.auth.routes import router as auth_router
from app.core.config import settings
from app.users.routes import router as users_router
from app.api.routes.ai import router as ai_router
app = FastAPI(
    title="Proof-of-Work API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    https_only=False,
    same_site="lax",
)

app.state.oauth = oauth

app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(service_requests_router)
app.include_router(jobs_router)
app.include_router(evidence_router)
app.include_router(ai_router)
@app.get("/")
async def root():
    return {
        "name": "Proof-of-Work API",
        "version": "0.1.0",
        "status": "running",
    }
