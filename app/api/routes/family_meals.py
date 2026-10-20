from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.notifications import push_notification
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.family_meal import Meal
from app.models.group import Group, GroupType
from app.models.group_membership import (
    GroupMembership,
    MemberRole,
    MembershipStatus,
)
from app.models.responsibility import (
    ResponsibilityReport,
    ResponsibilityStatus,
    ShoppingResponsibility,
)
from app.models.user import User
from app.schemas.family_meal import (
    FamilyMealUpdate,
    MealCreate,
    MealResponse,
    ResponsibilityReportCreate,
    ShoppingResponsibilityCreate,
    ShoppingResponsibilityResponse,
)


router = APIRouter(
    prefix="/api/v1/family-meals",
    tags=["family meals"],
)


async def require_family_admin(
    db: AsyncSession,
    user_id: int,
    group_id: int,
) -> Group:
    """Ensure the user is an active admin of this group."""
    group = await db.get(Group, group_id)
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    query = select(GroupMembership).where(
        GroupMembership.user_id == user_id,
        GroupMembership.group_id == group_id,
        GroupMembership.role == MemberRole.ADMIN,
        GroupMembership.status == MembershipStatus.ACTIVE,
    )

    membership = await db.scalar(query)

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be an admin of this group.",
        )

    return group


async def require_group_member(
    db: AsyncSession,
    user_id: int,
    group_id: int,
) -> GroupMembership:
    membership = await db.scalar(
        select(GroupMembership).where(
            GroupMembership.user_id == user_id,
            GroupMembership.group_id == group_id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this group.",
        )
    return membership


async def get_family_meal_or_404(
    db: AsyncSession,
    meal_id: int,
) -> Meal:
    """Find a meal or return 404 if it does not exist."""
    meal = await db.scalar(select(Meal).where(Meal.id == meal_id))

    if meal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal not found.",
        )

    return meal


# CREATE MEAL
@router.post(
    "/{group_id}/meals",
    response_model=MealResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_family_meal(
    group_id: int,
    meal_data: MealCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_family_admin(db, current_user.id, group_id)

    meal = Meal(
        **meal_data.model_dump(),
        group_id=group_id,
    )

    db.add(meal)
    await db.commit()
    await db.refresh(meal)

    return meal


# LIST MEALS IN A GROUP
@router.get(
    "/{group_id}/meals",
    response_model=list[MealResponse],
)
async def list_family_meals(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_group_member(db, current_user.id, group_id)

    query = (
        select(Meal)
        .where(Meal.group_id == group_id)
        .order_by(Meal.created_at.desc(), Meal.id.desc())
    )

    result = await db.execute(query)
    return result.scalars().all()


# GET ONE MEAL
@router.get(
    "/meals/{meal_id}",
    response_model=MealResponse,
)
async def get_family_meal(
    meal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meal = await get_family_meal_or_404(db, meal_id)
    await require_group_member(db, current_user.id, meal.group_id)
    return meal


# UPDATE MEAL
@router.patch(
    "/meals/{meal_id}",
    response_model=MealResponse,
)
async def update_family_meal(
    meal_id: int,
    meal_update: FamilyMealUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meal = await get_family_meal_or_404(db, meal_id)
    await require_family_admin(db, current_user.id, meal.group_id)

    updates = meal_update.model_dump(exclude_unset=True)

    for key, value in updates.items():
        setattr(meal, key, value)

    await db.commit()
    await db.refresh(meal)

    return meal


# DELETE MEAL
@router.delete(
    "/meals/{meal_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_family_meal(
    meal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meal = await get_family_meal_or_404(db, meal_id)
    await require_family_admin(db, current_user.id, meal.group_id)

    await db.delete(meal)
    await db.commit()

    return None


# SHOPPING RESPONSIBILITIES FOR FAMILY MEALS
@router.get(
    "/{group_id}/responsibilities",
    response_model=list[ShoppingResponsibilityResponse],
)
async def list_shopping_responsibilities(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_group_member(db, current_user.id, group_id)

    rows = await db.execute(
        select(ShoppingResponsibility, User, Meal)
        .join(User, User.id == ShoppingResponsibility.assigned_user_id)
        .join(Meal, Meal.id == ShoppingResponsibility.meal_id)
        .where(ShoppingResponsibility.group_id == group_id)
        .order_by(ShoppingResponsibility.created_at.desc(), ShoppingResponsibility.id.desc())
    )

    return [
        ShoppingResponsibilityResponse(
            id=resp.id,
            group_id=resp.group_id,
            assigned_user_id=resp.assigned_user_id,
            assigned_username=user.username,
            meal_id=resp.meal_id,
            meal_name=meal.name,
            ingredients=meal.ingredients or [],
            status=resp.status.value if hasattr(resp.status, "value") else str(resp.status),
            due_at=resp.due_at,
            created_at=resp.created_at,
        )
        for resp, user, meal in rows.all()
    ]


@router.post(
    "/{group_id}/responsibilities",
    response_model=ShoppingResponsibilityResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_shopping_responsibility(
    group_id: int,
    payload: ShoppingResponsibilityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await require_family_admin(db, current_user.id, group_id)

    target_membership = await db.scalar(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == payload.assigned_user_id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )
    if target_membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assigned user is not an active member of this group.",
        )

    meal = await get_family_meal_or_404(db, payload.meal_id)
    if meal.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Meal does not belong to this group.",
        )

    assigned_user = await db.get(User, payload.assigned_user_id)
    resp = ShoppingResponsibility(
        group_id=group_id,
        assigned_user_id=payload.assigned_user_id,
        meal_id=payload.meal_id,
        status=ResponsibilityStatus.PENDING,
        due_at=payload.due_at,
    )
    db.add(resp)

    if payload.assigned_user_id != current_user.id:
        await push_notification(
            db,
            user_id=payload.assigned_user_id,
            title=f"Shopping task in {group.name}",
            message=f"You were assigned to shop for “{meal.name}”.",
            notification_type="shopping",
        )

    await db.commit()
    await db.refresh(resp)

    return ShoppingResponsibilityResponse(
        id=resp.id,
        group_id=resp.group_id,
        assigned_user_id=resp.assigned_user_id,
        assigned_username=assigned_user.username if assigned_user else "Member",
        meal_id=resp.meal_id,
        meal_name=meal.name,
        ingredients=meal.ingredients or [],
        status=resp.status.value if hasattr(resp.status, "value") else str(resp.status),
        due_at=resp.due_at,
        created_at=resp.created_at,
    )


@router.patch(
    "/responsibilities/{responsibility_id}/status",
    response_model=ShoppingResponsibilityResponse,
)
async def update_shopping_responsibility_status(
    responsibility_id: int,
    new_status: ResponsibilityStatus,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resp = await db.get(ShoppingResponsibility, responsibility_id)
    if resp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shopping responsibility not found.",
        )

    membership = await require_group_member(db, current_user.id, resp.group_id)
    is_admin = membership.role == MemberRole.ADMIN
    is_assignee = resp.assigned_user_id == current_user.id

    if not is_admin and not is_assignee:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned member or a group admin can update this task.",
        )

    resp.status = new_status
    await db.commit()
    await db.refresh(resp)

    assigned_user = await db.get(User, resp.assigned_user_id)
    meal = await db.get(Meal, resp.meal_id)

    return ShoppingResponsibilityResponse(
        id=resp.id,
        group_id=resp.group_id,
        assigned_user_id=resp.assigned_user_id,
        assigned_username=assigned_user.username if assigned_user else "Member",
        meal_id=resp.meal_id,
        meal_name=meal.name if meal else "Meal",
        ingredients=meal.ingredients if meal else [],
        status=resp.status.value if hasattr(resp.status, "value") else str(resp.status),
        due_at=resp.due_at,
        created_at=resp.created_at,
    )


@router.post("/responsibilities/{responsibility_id}/report")
async def report_shopping_responsibility(
    responsibility_id: int,
    body: ResponsibilityReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resp = await db.get(ShoppingResponsibility, responsibility_id)
    if resp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shopping responsibility not found.",
        )

    await require_group_member(db, current_user.id, resp.group_id)

    report = ResponsibilityReport(
        responsibility_id=resp.id,
        reported_by=current_user.id,
        reason=body.reason.strip(),
    )
    resp.status = ResponsibilityStatus.REPORTED
    db.add(report)

    if resp.assigned_user_id != current_user.id:
        await push_notification(
            db,
            user_id=resp.assigned_user_id,
            title="Shopping task reported",
            message=f"{current_user.username} reported an issue: {body.reason.strip()}",
            notification_type="report",
        )

    await db.commit()
    return {"detail": "Report submitted.", "status": resp.status.value}
