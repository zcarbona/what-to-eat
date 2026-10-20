import enum
from datetime import date, datetime

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


class DecisionRoundStatus(str, enum.Enum):
    OPEN = "OPEN"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class DecisionRound(Base):
    __tablename__ = "decision_rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Optional scheduled date for turn-based family meal rounds
    scheduled_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
        index=True,
    )

    # Optional assigned member whose turn it is to choose
    assigned_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Optional selected family meal
    selected_meal_id: Mapped[int | None] = mapped_column(
        ForeignKey("family_meals.id", ondelete="SET NULL"),
        nullable=True,
    )

    deadline_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    closes_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="OPEN",
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


class FoodSubmission(Base):
    __tablename__ = "food_submissions"

    __table_args__ = (
        UniqueConstraint(
            "round_id",
            "user_id",
            name="uq_food_submission_per_user",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    round_id: Mapped[int] = mapped_column(
        ForeignKey("decision_rounds.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    food_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    note: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class FoodDecisionResult(Base):
    __tablename__ = "food_decision_results"

    id: Mapped[int] = mapped_column(primary_key=True)

    round_id: Mapped[int] = mapped_column(
        ForeignKey("decision_rounds.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    winning_submission_id: Mapped[int] = mapped_column(
        ForeignKey("food_submissions.id", ondelete="CASCADE"),
        nullable=False,
    )

    selected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
