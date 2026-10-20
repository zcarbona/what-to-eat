"""FastAPI application entry point.

Registers the auth, groups, family-meals, food-decisions, gatherings, and
notifications routers and ensures all SQLAlchemy models are registered on
Base.metadata before init_db() runs.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import close_db, init_db

# Import models so their tables are registered on Base.metadata.
from app.models import (  # noqa: F401
    audit_log,
    family_meal,
    food_decision,
    gathering,
    group,
    group_membership,
    invitation,
    notification,
    responsibility,
    user,
)

from app.api.routes import (
    auth,
    family_meals,
    food_decisions,
    gatherings,
    groups,
    notifications,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield
    await close_db()


app = FastAPI(title="What to Eat API", lifespan=lifespan)

# Comma-separated list of allowed browser origins for the frontend.
_origins = os.environ.get(
    "FRONTEND_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(family_meals.router)
app.include_router(food_decisions.router)
app.include_router(gatherings.router)
app.include_router(notifications.router)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}
