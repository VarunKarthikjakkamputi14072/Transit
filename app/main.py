"""Transit FastAPI entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import __version__
from app.config import get_settings
from app.database import SessionLocal, get_db, init_db
from app.middleware import APIKeyRateLimitAndLogMiddleware
from app.models import RateLimitConfig
from app.redis_client import close_redis
from app.routers import analytics, auth, gateway
from app.upstream.base import close_http_client


def _seed_rate_limit_config(db: Session) -> None:
    settings = get_settings()
    seeds = {
        "free": settings.free_tier_requests_per_hour,
        "pro": settings.pro_tier_requests_per_hour,
    }
    existing = {
        row.tier
        for row in db.execute(select(RateLimitConfig)).scalars().all()
    }
    for tier, requests_per_hour in seeds.items():
        if tier not in existing:
            db.add(RateLimitConfig(tier=tier, requests_per_hour=requests_per_hour))
    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        _seed_rate_limit_config(db)
    finally:
        db.close()
    try:
        yield
    finally:
        await close_redis()
        await close_http_client()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Transit",
        version=__version__,
        description=(
            "Transit is an AI gateway that proxies NVIDIA NIM open-LLM inference "
            "behind a unified, authenticated, rate-limited REST surface. Clients "
            "use Transit API keys; the upstream NVIDIA key never leaves the server."
        ),
        lifespan=lifespan,
    )

    app.add_middleware(APIKeyRateLimitAndLogMiddleware)

    # CORS: the gateway is meant to be called cross-origin (from the developer
    # portal on Vercel and from any client). Auth is via the X-API-Key header,
    # not cookies, so credentials are not needed and wildcard origins are safe.
    # Added after the rate-limit middleware so it sits outermost and answers
    # CORS preflight (OPTIONS) before auth/rate-limit logic runs.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(gateway.router)
    app.include_router(analytics.router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    @app.get("/", tags=["meta"])
    def root() -> dict[str, str]:
        return {
            "name": "Transit",
            "version": __version__,
            "docs": "/docs",
        }

    @app.get("/admin/rate-limits", tags=["meta"])
    def list_rate_limits(db: Session = Depends(get_db)) -> list[dict]:
        rows = db.execute(select(RateLimitConfig)).scalars().all()
        return [{"tier": r.tier, "requests_per_hour": r.requests_per_hour} for r in rows]

    return app


app = create_app()
