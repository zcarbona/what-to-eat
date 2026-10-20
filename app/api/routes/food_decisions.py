import secrets
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.notifications import push_notification
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.family_meal import FamilyMeal
from app.models.food_decision import (
    DecisionRound,
    FoodDecisionResult,
    FoodSubmission,
)
from app.models.group import Group, GroupType
from app.models.group_membership import (
    GroupMembership,
    MemberRole,
    MembershipStatus,
)
from app.models.user import User
from app.schemas.food_decision import (
    DecisionRoundCreate,
    DecisionRoundResolve,
    DecisionRoundResponse,
    FoodSubmissionCreate,
    FoodSubmissionResponse,
)


router = APIRouter(
    prefix="/api/v1/food-decisions",
    tags=["Food Decisions"],
)


async def _require_membership(
    db: AsyncSession,
    group_id: int,
    user_id: int,
) -> GroupMembership:
    membership = await db.scalar(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == user_id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this group.",
        )
    return membership


async def _hydrate_round(db: AsyncSession, dr: DecisionRound) -> DecisionRoundResponse:
    assigned_username: str | None = None
    if dr.assigned_user_id is not None:
        assigned_user = await db.get(User, dr.assigned_user_id)
        if assigned_user:
            assigned_username = assigned_user.username

    selected_meal_name: str | None = None
    if dr.selected_meal_id is not None:
        meal = await db.get(FamilyMeal, dr.selected_meal_id)
        if meal:
            selected_meal_name = meal.name

    sub_rows = await db.execute(
        select(FoodSubmission, User)
        .join(User, User.id == FoodSubmission.user_id)
        .where(FoodSubmission.round_id == dr.id)
        .order_by(FoodSubmission.created_at.asc(), FoodSubmission.id.asc())
    )
    submissions = [
        FoodSubmissionResponse(
            id=sub.id,
            round_id=sub.round_id,
            user_id=sub.user_id,
            username=u.username,
            food_name=sub.food_name,
            note=sub.note,
            created_at=sub.created_at,
        )
        for sub, u in sub_rows.all()
    ]

    result_row = await db.scalar(
        select(FoodDecisionResult).where(FoodDecisionResult.round_id == dr.id)
    )
    winning_submission_id: int | None = None
    winning_food_name: str | None = None
    winning_username: str | None = None

    if result_row is not None:
        winning_submission_id = result_row.winning_submission_id
        for s in submissions:
            if s.id == winning_submission_id:
                winning_food_name = s.food_name
                winning_username = s.username
                break

    if winning_food_name is None and selected_meal_name is not None:
        winning_food_name = selected_meal_name
        winning_username = assigned_username

    return DecisionRoundResponse(
        id=dr.id,
        group_id=dr.group_id,
        title=dr.title,
        created_by=dr.created_by,
        scheduled_date=dr.scheduled_date,
        assigned_user_id=dr.assigned_user_id,
        assigned_username=assigned_username,
        selected_meal_id=dr.selected_meal_id,
        selected_meal_name=selected_meal_name,
        deadline_at=dr.deadline_at,
        closes_at=dr.closes_at,
        status=dr.status,
        decided_at=dr.decided_at,
        created_at=dr.created_at,
        submissions=submissions,
        winning_submission_id=winning_submission_id,
        winning_food_name=winning_food_name,
        winning_username=winning_username,
    )


@router.get(
    "/groups/{group_id}/rounds",
    response_model=list[DecisionRoundResponse],
)
async def list_group_decision_rounds(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_membership(db, group_id, current_user.id)

    rounds_result = await db.execute(
        select(DecisionRound)
        .where(DecisionRound.group_id == group_id)
        .order_by(DecisionRound.created_at.desc(), DecisionRound.id.desc())
    )
    rounds = rounds_result.scalars().all()
    return [await _hydrate_round(db, r) for r in rounds]


@router.post(
    "/groups/{group_id}/rounds",
    response_model=DecisionRoundResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_group_decision_round(
    group_id: int,
    payload: DecisionRoundCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(Group, group_id)
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    await _require_membership(db, group_id, current_user.id)

    if payload.assigned_user_id is not None:
        assigned_member = await db.scalar(
            select(GroupMembership).where(
                GroupMembership.group_id == group_id,
                GroupMembership.user_id == payload.assigned_user_id,
                GroupMembership.status == MembershipStatus.ACTIVE,
            )
        )
        if assigned_member is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned user is not an active member of this group.",
            )

    dr = DecisionRound(
        group_id=group_id,
        title=payload.title.strip(),
        created_by=current_user.id,
        scheduled_date=payload.scheduled_date,
        assigned_user_id=payload.assigned_user_id,
        deadline_at=payload.deadline_at,
        closes_at=payload.closes_at,
        status="OPEN",
    )
    db.add(dr)

    if payload.assigned_user_id and payload.assigned_user_id != current_user.id:
        await push_notification(
            db,
            user_id=payload.assigned_user_id,
            title=f"Your turn to choose in {group.name}",
            message=f"You were assigned to pick the meal for “{payload.title.strip()}”.",
            notification_type="decision",
        )

    await db.commit()
    await db.refresh(dr)
    return await _hydrate_round(db, dr)


@router.post(
    "/rounds/{round_id}/submissions",
    response_model=DecisionRoundResponse,
)
async def submit_food_option(
    round_id: int,
    payload: FoodSubmissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dr = await db.get(DecisionRound, round_id)
    if dr is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Decision round not found.",
        )

    await _require_membership(db, dr.group_id, current_user.id)

    if dr.status != "OPEN":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This decision round is no longer open.",
        )

    existing = await db.scalar(
        select(FoodSubmission).where(
            FoodSubmission.round_id == round_id,
            FoodSubmission.user_id == current_user.id,
        )
    )
    if existing is not None:
        existing.food_name = payload.food_name.strip()
        existing.note = payload.note.strip() if payload.note else None
    else:
        db.add(
            FoodSubmission(
                round_id=round_id,
                user_id=current_user.id,
                food_name=payload.food_name.strip(),
                note=payload.note.strip() if payload.note else None,
            )
        )

    await db.commit()
    await db.refresh(dr)
    return await _hydrate_round(db, dr)


@router.post(
    "/rounds/{round_id}/resolve",
    response_model=DecisionRoundResponse,
)
async def resolve_decision_round(
    round_id: int,
    payload: DecisionRoundResolve,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dr = await db.get(DecisionRound, round_id)
    if dr is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Decision round not found.",
        )

    membership = await _require_membership(db, dr.group_id, current_user.id)
    if dr.status != "OPEN":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This decision round is already closed.",
        )

    now = datetime.now(timezone.utc)

    # Mode 1: Family meal selection (assigned member or admin picks from family meals)
    if payload.mode == "meal" or payload.selected_meal_id is not None:
        if (
            dr.assigned_user_id is not None
            and dr.assigned_user_id != current_user.id
            and membership.role != MemberRole.ADMIN
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="It is not your turn to choose the meal.",
            )

        meal = await db.scalar(
            select(FamilyMeal).where(
                FamilyMeal.id == payload.selected_meal_id,
                FamilyMeal.group_id == dr.group_id,
                FamilyMeal.is_active.is_(True),
            )
        )
        if meal is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Active meal not found in this group.",
            )
        dr.selected_meal_id = meal.id
        dr.status = "COMPLETED"
        dr.decided_at = now
        await db.commit()
        await db.refresh(dr)
        return await _hydrate_round(db, dr)

    # Mode 2: Submissions resolution (random spin or specific pick)
    subs_result = await db.execute(
        select(FoodSubmission).where(FoodSubmission.round_id == round_id)
    )
    subs = list(subs_result.scalars().all())
    if not subs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add at least one food idea before deciding.",
        )

    if payload.mode == "pick" and payload.submission_id is not None:
        winner = next((s for s in subs if s.id == payload.submission_id), None)
        if winner is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Selected food submission not found.",
            )
    else:
        winner = secrets.choice(subs)

    existing_result = await db.scalar(
        select(FoodDecisionResult).where(FoodDecisionResult.round_id == round_id)
    )
    if existing_result is not None:
        existing_result.winning_submission_id = winner.id
    else:
        db.add(
            FoodDecisionResult(
                round_id=round_id,
                winning_submission_id=winner.id,
            )
        )

    dr.status = "COMPLETED"
    dr.decided_at = now
    await db.commit()
    await db.refresh(dr)
    return await _hydrate_round(db, dr)


@router.post(
    "/rounds/{round_id}/cancel",
    response_model=DecisionRoundResponse,
)
async def cancel_decision_round(
    round_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dr = await db.get(DecisionRound, round_id)
    if dr is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Decision round not found.",
        )

    membership = await _require_membership(db, dr.group_id, current_user.id)
    if membership.role != MemberRole.ADMIN and dr.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a group admin or the round creator can cancel this round.",
        )

    dr.status = "CANCELLED"
    await db.commit()
    await db.refresh(dr)
    return await _hydrate_round(db, dr)


@router.post("/decisions", status_code=status.HTTP_200_OK)
async def create_food_decision(
    group_id: int,
    scheduled_date: date,
    selected_meal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. Check that the group exists and is a family group.
    group_result = await db.execute(select(Group).where(Group.id == group_id))
    group = group_result.scalar_one_or_none()

    if group is None or group.group_type != GroupType.FAMILY:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family group not found.",
        )

    # 2. Check active group membership.
    await _require_membership(db, group_id, current_user.id)

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

    # 5. Enforce the deadline using timezone-aware timestamps when present.
    now = datetime.now(timezone.utc)
    deadline = decision_round.deadline_at

    if deadline is not None:
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
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
