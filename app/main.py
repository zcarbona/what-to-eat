"""FastAPI application entry point.

Registers the routers whose models and schemas currently import cleanly
(auth and groups). The family-meal, food-decision and gathering routers are
not mounted yet: their modules reference models/fields that do not exist
(see app/api/routes/{family_meals,food_decisions,gatherings}.py).
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import close_db, init_db

# Import models so their tables are registered on Base.metadata.
from app.models import user, group, group_membership, invitation  # noqa: F401

from app.api.routes import auth, groups


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


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}
