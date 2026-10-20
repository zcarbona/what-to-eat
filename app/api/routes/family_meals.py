
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.family_meal import Meal
from app.models.group import Group, GroupType
from app.models.group_membership import (
    GroupMembership,
    MemberRole,
    MembershipStatus,
)
from app.schemas.family_meal import (
    MealCreate,
    MealResponse,
    FamilyMealUpdate,
)


router = APIRouter(
    prefix="/api/v1/family-meals",
    tags=["family meals"],
)


async def require_family_admin(
    db: AsyncSession,
    user_id: int,
    group_id: int,
) -> None:
    """Ensure the user is an active admin of this family group."""

    query = (
        select(GroupMembership)
        .join(Group, Group.id == GroupMembership.group_id)
        .where(
            GroupMembership.user_id == user_id,
            GroupMembership.group_id == group_id,
            GroupMembership.role == MemberRole.ADMIN,
            GroupMembership.status == MembershipStatus.ACTIVE,
            Group.group_type == GroupType.FAMILY,
        )
    )

    membership = await db.scalar(query)

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be an admin of this family group.",
        )


async def get_family_meal_or_404(
    db: AsyncSession,
    meal_id: int,
) -> Meal:
    """Find a meal or return 404 if it does not exist."""

    query = (
        select(Meal)
        .join(Group, Group.id == Meal.group_id)
        .where(
            Meal.id == meal_id,
            Group.group_type == GroupType.FAMILY,
        )
    )

    meal = await db.scalar(query)

    if meal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family meal not found.",
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
    await require_family_admin(
        db, current_user.id, group_id
    )

    meal = Meal(
        **meal_data.model_dump(),
        group_id=group_id,
    )

    db.add(meal)
    await db.commit()
    await db.refresh(meal)

    return meal


# LIST MEALS IN A FAMILY GROUP
@router.get(
    "/{group_id}/meals",
    response_model=list[MealResponse],
)
async def list_family_meals(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership_query = (
        select(GroupMembership)
        .join(Group, Group.id == GroupMembership.group_id)
        .where(
            GroupMembership.user_id == current_user.id,
            GroupMembership.group_id == group_id,
            GroupMembership.status == MembershipStatus.ACTIVE,
            Group.group_type == GroupType.FAMILY,
        )
    )

    membership = await db.scalar(membership_query)

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this family group.",
        )

    query = select(Meal).where(Meal.group_id == group_id)

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

    membership_query = select(GroupMembership).where(
        GroupMembership.user_id == current_user.id,
        GroupMembership.group_id == meal.group_id,
        GroupMembership.status == MembershipStatus.ACTIVE,
    )

    membership = await db.scalar(membership_query)

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this family group.",
        )

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

    await require_family_admin(
        db, current_user.id, meal.group_id
    )

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

    await require_family_admin(
        db, current_user.id, meal.group_id
    )

    await db.delete(meal)
    await db.commit()

    return None
