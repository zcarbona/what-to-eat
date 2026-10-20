import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ResponsibilityStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    REPORTED = "reported"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


class ShoppingResponsibility(Base):
    __tablename__ = "shopping_responsibilities"

    id: Mapped[int] = mapped_column(primary_key=True)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
    )

    assigned_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    meal_id: Mapped[int] = mapped_column(
        ForeignKey("family_meals.id", ondelete="CASCADE"),
        nullable=False,
    )

    status: Mapped[ResponsibilityStatus] = mapped_column(
        Enum(ResponsibilityStatus),
        default=ResponsibilityStatus.PENDING,
        nullable=False,
    )

    due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class ResponsibilityReport(Base):
    __tablename__ = "responsibility_reports"

    id: Mapped[int] = mapped_column(primary_key=True)

    responsibility_id: Mapped[int] = mapped_column(
        ForeignKey("shopping_responsibilities.id", ondelete="CASCADE"),
        nullable=False,
    )

    reported_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    reason: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    confirmed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class MemberRestriction(Base):
    __tablename__ = "member_restrictions"

    id: Mapped[int] = mapped_column(primary_key=True)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    report_id: Mapped[int] = mapped_column(
        ForeignKey("responsibility_reports.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    reason: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
