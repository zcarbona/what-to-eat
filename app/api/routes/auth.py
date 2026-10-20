
from datetime import datetime, timedelta, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    status,
)
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import REFRESH_TOKEN_EXPIRE_HOURS
from app.core.database import get_db
from app.core.security import (
    validate_user_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    check_rate_limit,
    MAX_LOGIN_ATTEMPTS,
    LOCK_MINUTES,
)
from app.models.user import User
from app.schemas.auth import Token, RefreshRequest, UserResponse


router = APIRouter(
    prefix="/api/v1/auth",
    tags=["auth"],
)


# --------------------------------------------------
# LOGIN
# --------------------------------------------------

@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    # Rate limit login requests by client IP.
    client_ip = (
        request.client.host
        if request.client
        else "unknown"
    )

    if not check_rate_limit(
        f"login:{client_ip}",
        limit=10,
        window_minutes=1,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
        )

    # OAuth2PasswordRequestForm calls the login field "username".
    # Here, the user enters their email address in that field.
    result = await db.execute(
        select(User).where(
            User.email == form_data.username
        )
    )
    user = result.scalar_one_or_none()

    # Do not reveal whether an email exists.
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive",
        )

    now = datetime.now(timezone.utc)

    # Requires locked_until and failed_login_attempts
    # columns on the User model.
    if user.locked_until is not None:
        locked_until = user.locked_until

        # Handle databases that return naive datetimes.
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(
                tzinfo=timezone.utc
            )

        if locked_until > now:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account temporarily locked. Try again later.",
            )

        # The previous lock expired; reset the counter.
        user.locked_until = None
        user.failed_login_attempts = 0

    if not validate_user_password(
        user,
        form_data.password,
    ):
        user.failed_login_attempts += 1

        if user.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
            user.locked_until = (
                now + timedelta(minutes=LOCK_MINUTES)
            )

        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Successful login: clear failed attempts.
    user.failed_login_attempts = 0
    user.locked_until = None

    access_token = create_access_token({
        "sub": str(user.id),
    })

    refresh_token = create_refresh_token({
        "sub": str(user.id),
    })

    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


# --------------------------------------------------
# REFRESH ACCESS TOKEN
# --------------------------------------------------

@router.post("/refresh", response_model=Token)
async def refresh_tokens(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(
        body.refresh_token,
        expected_type="refresh",
    )

    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )

    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Issue a new access token and rotate the refresh token.
    access_token = create_access_token({
        "sub": str(user.id),
    })

    refresh_token = create_refresh_token({
        "sub": str(user.id),
    })

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


# --------------------------------------------------
# CURRENT USER
# --------------------------------------------------

@router.get("/me", response_model=UserResponse)
async def read_current_user(
    current_user: User = Depends(get_current_user),
):
    return current_user


# --------------------------------------------------
# REGISTER
# Uses the existing UserCreate schema and password-strength rule.
# --------------------------------------------------

from app.core.security import (  # noqa: E402
    enforce_rate_limit,
    hash_password,
    validate_password_strength,
)
from app.schemas.auth import UserCreate  # noqa: E402


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    request: Request,
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit(request, limit=5, window_minutes=1)

    if not validate_password_strength(body.password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Password must be at least 8 characters and "
                "contain at least one letter and one digit."
            ),
        )

    email = body.email.lower()
    username = body.username.strip()

    existing = await db.execute(
        select(User).where(
            (User.email == email) | (User.username == username)
        )
    )

    if existing.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email or username already exists.",
        )

    user = User(
        username=username,
        email=email,
        hashed_password=hash_password(body.password),
    )

    try:
        db.add(user)
        await db.commit()
        await db.refresh(user)
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the account.",
        ) from e

    return user
