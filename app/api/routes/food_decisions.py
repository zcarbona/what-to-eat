
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.group import Group, GroupType
from app.models.group_membership import (
    GroupMembership,
    MembershipStatus,
)
from app.models.family_meal import FamilyMeal
from app.models.food_decision import DecisionRound


router = APIRouter(
    prefix="/api/v1/food-decisions",
    tags=["Food Decisions"],
)


@router.post("/decisions", status_code=status.HTTP_200_OK)
async def create_food_decision(
    group_id: int,
    scheduled_date: datetime.date,
    selected_meal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. Check that the group exists and is a family group.
    group_result = await db.execute(
        select(Group).where(Group.id == group_id)
    )
    group = group_result.scalar_one_or_none()

    if group is None or group.group_type != GroupType.FAMILY:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family group not found.",
        )

    # 2. Check active group membership.
    membership_result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this group.",
        )

    #3. check if the group type is family
    if group.group_type != GroupType.FAMILY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only family groups can make food decisions.",
        )

    # 3. Lock the existing round to prevent concurrent submissions.
    round_result = await db.execute(
        select(DecisionRound)
        .where(
            DecisionRound.group_id == group_id,
            DecisionRound.scheduled_date == scheduled_date,
        )
        .with_for_update()
    )
    decision_round = round_result.scalar_one_or_none()

    if decision_round is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No decision round exists for this date.",
        )

    # 4. Verify that it is this member's turn.
    if decision_round.assigned_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="It is not your turn to choose the meal.",
        )

    if decision_round.status != "OPEN":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This decision round is no longer open.",
        )

    # 5. Enforce the deadline using timezone-aware timestamps.
    now = datetime.now(timezone.utc)
    deadline = decision_round.deadline_at

    if deadline.tzinfo is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The decision deadline must include a timezone.",
        )

    if now >= deadline:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The decision deadline has passed.",
        )

    # 6. Verify that the selected meal belongs to this group.
    meal_result = await db.execute(
        select(FamilyMeal).where(
            FamilyMeal.id == selected_meal_id,
            FamilyMeal.group_id == group_id,
            FamilyMeal.is_active.is_(True),
        )
    )
    meal = meal_result.scalar_one_or_none()

    if meal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active meal not found in this family group.",
        )

    # 7. Save the member's choice on the existing round.
    decision_round.selected_meal_id = meal.id
    decision_round.status = "COMPLETED"
    decision_round.decided_at = now

    try:
        await db.commit()
        await db.refresh(decision_round)
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save the meal decision.",
        )

    return {
        "message": "Meal decision saved successfully.",
        "round_id": decision_round.id,
        "group_id": decision_round.group_id,
        "scheduled_date": decision_round.scheduled_date,
        "selected_meal_id": decision_round.selected_meal_id,
        "meal_name": meal.name,
        "status": decision_round.status,
        "decided_at": decision_round.decided_at,
    }
