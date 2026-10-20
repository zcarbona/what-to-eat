from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.gathering import (
    GatheringEvent,
    GatheringMenuItem,
    GatheringPreference,
)
from app.models.group import Group
from app.models.group_membership import (
    GroupMembership,
    MemberRole,
    MembershipStatus,
)
from app.models.user import User
from app.schemas.gathering import (
    GatheringCreate,
    GatheringMenuItemCreate,
    GatheringMenuItemResponse,
    GatheringPreferenceCreate,
    GatheringPreferenceResponse,
    GatheringResponse,
    GatheringUpdate,
)

router = APIRouter(
    prefix="/api/v1/gatherings",
    tags=["gatherings"],
)


async def _require_group_member(
    db: AsyncSession,
    group_id: int,
    user_id: int,
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
            detail="You must be an active member of this group.",
        )
    return membership


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
    group = await db.scalar(select(Group).where(Group.id == gathering.group_id))

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
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
            detail="You must be an admin of this group to create a gathering.",
        )

    new_gathering = GatheringEvent(
        name=gathering.name.strip(),
        description=gathering.description.strip() if gathering.description else None,
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
    group = await db.scalar(select(Group).where(Group.id == group_id))

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    await _require_group_member(db, group_id, current_user.id)

    query = (
        select(GatheringEvent)
        .where(GatheringEvent.group_id == group_id)
        .order_by(GatheringEvent.gathering_time.asc(), GatheringEvent.id.desc())
    )
    result = await db.execute(query)
    return result.scalars().all()


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
        select(GatheringEvent).where(GatheringEvent.id == event_id)
    )

    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found.",
        )

    await _require_group_member(db, gathering.group_id, current_user.id)
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
        select(GatheringEvent).where(GatheringEvent.id == event_id)
    )

    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found.",
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
            detail="You must be an admin of this group to update a gathering.",
        )

    update_data = gathering_update.model_dump(exclude_unset=True)
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
        select(GatheringEvent).where(GatheringEvent.id == event_id)
    )

    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found.",
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
            detail="You must be an admin of this group to delete a gathering.",
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


@router.get(
    "/event/{event_id}/rsvps",
    response_model=list[GatheringPreferenceResponse],
)
async def list_gathering_rsvps(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    gathering = await db.scalar(
        select(GatheringEvent).where(GatheringEvent.id == event_id)
    )
    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found.",
        )

    await _require_group_member(db, gathering.group_id, current_user.id)

    rows = await db.execute(
        select(GatheringPreference, User)
        .join(User, User.id == GatheringPreference.user_id)
        .where(GatheringPreference.event_id == event_id)
        .order_by(GatheringPreference.created_at.asc(), GatheringPreference.id.asc())
    )
    return [
        GatheringPreferenceResponse(
            id=pref.id,
            event_id=pref.event_id,
            user_id=pref.user_id,
            username=u.username,
            allergies=pref.allergies or [],
            dietary_restrictions=pref.dietary_restrictions or [],
            dislikes=pref.dislikes or [],
            notes=pref.notes,
            created_at=pref.created_at,
        )
        for pref, u in rows.all()
    ]


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
        select(GatheringEvent).where(GatheringEvent.id == event_id)
    )

    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found.",
        )

    await _require_group_member(db, gathering.group_id, current_user.id)

    existing = await db.scalar(
        select(GatheringPreference).where(
            GatheringPreference.event_id == event_id,
            GatheringPreference.user_id == current_user.id,
        )
    )

    if existing is not None:
        existing.allergies = preferences.allergies
        existing.dietary_restrictions = preferences.dietary_restrictions
        existing.dislikes = preferences.dislikes
        existing.notes = preferences.notes
        pref = existing
    else:
        pref = GatheringPreference(
            event_id=event_id,
            user_id=current_user.id,
            allergies=preferences.allergies,
            dietary_restrictions=preferences.dietary_restrictions,
            dislikes=preferences.dislikes,
            notes=preferences.notes,
        )
        db.add(pref)

    try:
        await db.commit()
        await db.refresh(pref)
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while submitting your RSVP.",
        )

    return GatheringPreferenceResponse(
        id=pref.id,
        event_id=pref.event_id,
        user_id=pref.user_id,
        username=current_user.username,
        allergies=pref.allergies or [],
        dietary_restrictions=pref.dietary_restrictions or [],
        dislikes=pref.dislikes or [],
        notes=pref.notes,
        created_at=pref.created_at,
    )


@router.get(
    "/event/{event_id}/menu",
    response_model=list[GatheringMenuItemResponse],
)
async def list_gathering_menu(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    gathering = await db.scalar(
        select(GatheringEvent).where(GatheringEvent.id == event_id)
    )
    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found.",
        )

    await _require_group_member(db, gathering.group_id, current_user.id)

    rows = await db.execute(
        select(GatheringMenuItem, User)
        .outerjoin(User, User.id == GatheringMenuItem.assigned_user_id)
        .where(GatheringMenuItem.event_id == event_id)
        .order_by(GatheringMenuItem.created_at.asc(), GatheringMenuItem.id.asc())
    )
    return [
        GatheringMenuItemResponse(
            id=item.id,
            event_id=item.event_id,
            name=item.name,
            category=item.category,
            assigned_user_id=item.assigned_user_id,
            assigned_username=u.username if u else None,
            created_by=item.created_by,
            created_at=item.created_at,
        )
        for item, u in rows.all()
    ]


@router.post(
    "/event/{event_id}/menu",
    response_model=GatheringMenuItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_gathering_menu_item(
    event_id: int,
    payload: GatheringMenuItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    gathering = await db.scalar(
        select(GatheringEvent).where(GatheringEvent.id == event_id)
    )
    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found.",
        )

    await _require_group_member(db, gathering.group_id, current_user.id)

    assigned_username: str | None = None
    if payload.assigned_user_id is not None:
        assignee = await db.get(User, payload.assigned_user_id)
        if assignee:
            assigned_username = assignee.username

    item = GatheringMenuItem(
        event_id=event_id,
        name=payload.name.strip(),
        category=payload.category.strip() or "dish",
        assigned_user_id=payload.assigned_user_id,
        created_by=current_user.id,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    return GatheringMenuItemResponse(
        id=item.id,
        event_id=item.event_id,
        name=item.name,
        category=item.category,
        assigned_user_id=item.assigned_user_id,
        assigned_username=assigned_username,
        created_by=item.created_by,
        created_at=item.created_at,
    )


@router.delete(
    "/menu/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_gathering_menu_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(GatheringMenuItem, item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found.",
        )

    gathering = await db.get(GatheringEvent, item.event_id)
    if gathering is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gathering not found.",
        )

    membership = await _require_group_member(db, gathering.group_id, current_user.id)
    if membership.role != MemberRole.ADMIN and item.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a group admin or the item creator can remove this item.",
        )

    await db.delete(item)
    await db.commit()
    return None
