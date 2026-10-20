
from datetime import datetime, date

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DecisionRound(Base):
    __tablename__ = "decision_rounds"

    __table_args__ = (
        UniqueConstraint(
            "group_id",
            "scheduled_date",
            name="uq_decision_round_group_date",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # The day this meal decision is intended for
    scheduled_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )

    # The member whose turn it is to choose
    assigned_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # The selected meal; remains NULL until a meal is selected
    selected_meal_id: Mapped[int | None] = mapped_column(
        ForeignKey("family_meals.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Store a timezone-aware deadline corresponding to 18:00
    deadline_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # PENDING, COMPLETED, AUTO_SELECTED, NEEDS_ATTENTION
    status: Mapped[str] = mapped_column(
        String(50),
        default="PENDING",
        nullable=False,
    )

    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
