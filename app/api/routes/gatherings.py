
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.group import Group, GroupType
from app.models.group_membership import (
    GroupMembership,
    MemberRole,
    MembershipStatus,
)
from app.models.gathering import GatheringEvent, GatheringPreference
from app.schemas.gathering import (
    GatheringCreate,
    GatheringResponse,
    GatheringUpdate,
    GatheringPreferenceCreate,
    GatheringPreferenceResponse,
)

router = APIRouter(
    prefix="/api/v1/gatherings",
    tags=["gatherings"],
)


@router.post(
    "/create-gathering",
    response_model=GatheringResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_gathering(
    gathering: GatheringCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check if the group exists and is a family group
    group = await db.scalar(
        select(Group).where(
            Group.id == gathering.group_id,
            Group.group_type == GroupType.FAMILY,
        )
    )

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found or not a family group",
        )

    query = select(GroupMembership).where(
        GroupMembership.user_id == current_user.id,
        GroupMembership.group_id == gathering.group_id,
        GroupMembership.role == MemberRole.ADMIN,
        GroupMembership.status == MembershipStatus.ACTIVE,
    )

    if await db.scalar(query) is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be an admin of this family group to create a gathering.",
        )

    new_gathering = GatheringEvent(
        name=gathering.name,
        description=gathering.description,
        gathering_time=gathering.gathering_time,
        meal_type=gathering.meal_type,
        group_id=gathering.group_id,
        created_by=current_user.id,
    )

    try:
        db.add(new_gathering)
        await db.commit()
        await db.refresh(new_gathering)
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while creating the gathering.",
        )

    return new_gathering


@router.get(
    "/group/{group_id}",
    response_model=list[GatheringResponse],
)
async def get_gatherings_by_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check if the group exists and is a family group
    group = await db.scalar(
        select(Group).where(
            Group.id == group_id,
            Group.group_type == GroupType.FAMILY,
        )
    )

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found or not a family group",
        )

    # Check if the user is a member of the group
    query = select(GroupMembership).where(
        GroupMembership.user_id == current_user.id,
        GroupMembership.group_id == group_id,
        GroupMembership.status == MembershipStatus.ACTIVE,
    )

    if await db.scalar(query) is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a member of this family group to view gatherings.",
        )

    # Fetch gatherings for the group
    query = select(GatheringEvent).where(
        GatheringEvent.group_id == group_id
    )
    result = await db.execute(query)
    gatherings = result.scalars().all()

    return gatherings


@router.get(
    "/event/{event_id}",
    response_model=GatheringResponse,
)
async def get_gathering_by_id(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    gathering = await db.scalar(
        select(GatheringEvent).where(
            GatheringEvent.id == event_id
        )
    )

    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found",
        )

    # Check if the user is a member of the associated group
    query = select(GroupMembership).where(
        GroupMembership.user_id == current_user.id,
        GroupMembership.group_id == gathering.group_id,
        GroupMembership.status == MembershipStatus.ACTIVE,
    )

    if await db.scalar(query) is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a member of this family group to view this gathering.",
        )

    return gathering


@router.patch(
    "/event/update/{event_id}",
    response_model=GatheringResponse,
)
async def update_gathering(
    event_id: int,
    gathering_update: GatheringUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    gathering = await db.scalar(
        select(GatheringEvent).where(
            GatheringEvent.id == event_id
        )
    )

    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found",
        )

    membership = await db.scalar(
        select(GroupMembership).where(
            GroupMembership.user_id == current_user.id,
            GroupMembership.group_id == gathering.group_id,
            GroupMembership.role == MemberRole.ADMIN,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be an admin of this family group to update a gathering.",
        )

    update_data = gathering_update.model_dump(exclude_unset=True)

    # Prevent null values for required fields
    required_fields = {"name", "gathering_time", "meal_type"}

    if any(
        field in update_data and update_data[field] is None
        for field in required_fields
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Name, gathering time, and meal type cannot be null.",
        )

    for field, value in update_data.items():
        setattr(gathering, field, value)

    try:
        await db.commit()
        await db.refresh(gathering)
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while updating the gathering.",
        )

    return gathering


@router.delete(
    "/event/delete/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_gathering(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    gathering = await db.scalar(
        select(GatheringEvent).where(
            GatheringEvent.id == event_id
        )
    )

    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found",
        )

    # Check if the user is an admin of the group
    membership = await db.scalar(
        select(GroupMembership).where(
            GroupMembership.user_id == current_user.id,
            GroupMembership.group_id == gathering.group_id,
            GroupMembership.role == MemberRole.ADMIN,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be an admin of this family group to delete a gathering.",
        )

    try:
        await db.delete(gathering)
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while deleting the gathering.",
        )

    return None


@router.post(
    "/event/{event_id}/rsvp",
    response_model=GatheringPreferenceResponse,
)
async def rsvp_gathering(
    event_id: int,
    preferences: GatheringPreferenceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    gathering = await db.scalar(
        select(GatheringEvent).where(
            GatheringEvent.id == event_id
        )
    )

    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found",
        )

    membership = await db.scalar(
        select(GroupMembership).where(
            GroupMembership.user_id == current_user.id,
            GroupMembership.group_id == gathering.group_id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a member of this group to RSVP for this gathering.",
        )

    # Create the attendee's preferences
    new_preference = GatheringPreference(
        event_id=event_id,
        user_id=current_user.id,
        allergies=preferences.allergies,
        dietary_restrictions=preferences.dietary_restrictions,
        dislikes=preferences.dislikes,
    )

    db.add(new_preference)

    try:
        await db.commit()
        await db.refresh(new_preference)
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while submitting your RSVP.",
        )

    return new_preference


