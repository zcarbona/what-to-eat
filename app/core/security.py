
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import (
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_HOURS,
)
from app.core.database import get_db
from app.models.user import User


MAX_LOGIN_ATTEMPTS = 5
LOCK_MINUTES = 15

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login"
)

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)

# Basic in-memory rate limiter.
# For production, use Redis.
_rate_limit_store: dict[str, list[datetime]] = {}


# --------------------------------------------------
# RATE LIMITING
# --------------------------------------------------

def check_rate_limit(
    key: str,
    limit: int = 10,
    window_minutes: int = 1,
) -> bool:
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=window_minutes)

    timestamps = _rate_limit_store.get(key, [])

    valid_timestamps = [
        timestamp
        for timestamp in timestamps
        if timestamp > window_start
    ]

    if len(valid_timestamps) >= limit:
        _rate_limit_store[key] = valid_timestamps
        return False

    valid_timestamps.append(now)
    _rate_limit_store[key] = valid_timestamps

    return True


def enforce_rate_limit(
    request: Request,
    limit: int = 10,
    window_minutes: int = 1,
) -> None:
    client_ip = (
        request.client.host
        if request.client
        else "unknown"
    )

    key = f"{client_ip}:{request.url.path}"

    if not check_rate_limit(key, limit, window_minutes):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )


# --------------------------------------------------
# PASSWORD SECURITY
# --------------------------------------------------

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def validate_user_password(
    user: User,
    password: str,
) -> bool:
    return pwd_context.verify(
        password,
        user.hashed_password,
    )


def validate_password_strength(password: str) -> bool:
    if len(password) < 8:
        return False

    if not any(char.isdigit() for char in password):
        return False

    if not any(char.isalpha() for char in password):
        return False

    return True


# --------------------------------------------------
# JWT TOKEN CREATION
# --------------------------------------------------

def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None,
) -> str:
    to_encode = data.copy()

    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    to_encode.update({
        "iat": now,
        "exp": expire,
        "type": "access",
    })

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def create_refresh_token(
    data: dict,
    expires_delta: timedelta | None = None,
) -> str:
    to_encode = data.copy()

    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        or timedelta(hours=REFRESH_TOKEN_EXPIRE_HOURS)
    )

    to_encode.update({
        "iat": now,
        "exp": expire,
        "type": "refresh",
    })

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


# --------------------------------------------------
# JWT TOKEN VALIDATION
# --------------------------------------------------

def decode_token(
    token: str,
    expected_type: str,
) -> dict:
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        if payload.get("type") != expected_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not payload.get("sub"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token subject",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return payload

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# --------------------------------------------------
# CURRENT AUTHENTICATED USER
# --------------------------------------------------

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(token, expected_type="access")

    user_id = payload["sub"]

    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(
        select(User).where(User.id == user_id)
    )

    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
