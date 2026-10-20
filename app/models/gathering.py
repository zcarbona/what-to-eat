import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    JSON,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MealType(str, enum.Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"


class GatheringEvent(Base):
    __tablename__ = "gathering_events"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    meal_type: Mapped[MealType] = mapped_column(
        Enum(MealType),
        nullable=False,
    )

    gathering_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class GatheringPreference(Base):
    __tablename__ = "gathering_preferences"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    event_id: Mapped[int] = mapped_column(
        ForeignKey("gathering_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    allergies: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )

    dietary_restrictions: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )

    dislikes: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class GatheringMenuItem(Base):
    __tablename__ = "gathering_menu_items"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    event_id: Mapped[int] = mapped_column(
        ForeignKey("gathering_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
    )

    category: Mapped[str] = mapped_column(
        String(50),
        default="dish",
        nullable=False,
    )

    assigned_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
