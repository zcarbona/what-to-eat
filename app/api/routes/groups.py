
import hashlib
import secrets
import string

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
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
from app.models.invitation import Invitation

from app.schemas.group import (
    Creategroup as GroupCreate,
    GroupResponse,
    GroupUpdate,
    MembershipRoleUpdateResponse,
)
from app.schemas.invitation import InvitationResponse


router = APIRouter(
    prefix="/api/v1/groups",
    tags=["Groups"],
)

MAX_ACTIVE_INVITATIONS = 5
INVITATION_EXPIRY_MINUTES = 5
INVITATION_CODE_LENGTH = 8
INVITATION_ALPHABET = string.ascii_uppercase + string.digits


def hash_invitation_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def generate_invitation_code() -> str:
    return "".join(
        secrets.choice(INVITATION_ALPHABET)
        for _ in range(INVITATION_CODE_LENGTH)
    )


# --------------------------------------------------
# CREATE GROUP
# --------------------------------------------------

@router.post(
    "/",
    response_model=GroupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_group(
    group_data: GroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_group = Group(
        name=group_data.name,
        group_type=GroupType(group_data.group_type),
        created_by=current_user.id,
    )

    try:
        db.add(new_group)
        await db.flush()

        new_membership = GroupMembership(
            group_id=new_group.id,
            user_id=current_user.id,
            role=MemberRole.ADMIN,
            status=MembershipStatus.ACTIVE,
        )
        db.add(new_membership)

        await db.commit()
        await db.refresh(new_group)

        return new_group

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create group.",
        ) from e


# --------------------------------------------------
# GET CURRENT USER'S GROUPS
# --------------------------------------------------

@router.get("/", response_model=list[GroupResponse])
async def get_user_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Group)
        .join(
            GroupMembership,
            GroupMembership.group_id == Group.id,
        )
        .where(
            GroupMembership.user_id == current_user.id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    result = await db.execute(query)
    return result.scalars().all()


# --------------------------------------------------
# GET GROUP DETAILS
# --------------------------------------------------

@router.get("/{group_id}", response_model=GroupResponse)
async def get_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(Group, group_id)

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this group.",
        )

    return group


# --------------------------------------------------
# UPDATE GROUP
# --------------------------------------------------

@router.patch("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: int,
    group_data: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(Group, group_id)

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.role == MemberRole.ADMIN,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an admin of this group.",
        )

    update_data = group_data.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided for update.",
        )

    if update_data.get("name", "not_provided") is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Group name cannot be null.",
        )

    for key, value in update_data.items():
        setattr(group, key, value)

    try:
        await db.commit()
        await db.refresh(group)
        return group

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update group.",
        ) from e


# --------------------------------------------------
# UNSUBSCRIBE FROM GROUP
# --------------------------------------------------

@router.delete(
    "/{group_id}/unsubscribe",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unsubscribe_from_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(Group, group_id)

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )
    membership = result.scalar_one_or_none()

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not an active member of this group.",
        )

    if membership.role == MemberRole.ADMIN:
        admins_result = await db.execute(
            select(func.count())
            .select_from(GroupMembership)
            .where(
                GroupMembership.group_id == group_id,
                GroupMembership.role == MemberRole.ADMIN,
                GroupMembership.status == MembershipStatus.ACTIVE,
            )
        )

        if admins_result.scalar_one() <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "You are the last active admin. "
                    "Assign another admin before leaving."
                ),
            )

    try:
        membership.status = MembershipStatus.LEFT
        await db.commit()

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to unsubscribe from group.",
        ) from e

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------
# UPDATE MEMBER ROLE
# --------------------------------------------------

@router.patch(
    "/{group_id}/membership/{user_id}/role",
    response_model=MembershipRoleUpdateResponse,
)
async def update_membership_role(
    group_id: int,
    user_id: int,
    new_role: MemberRole,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(Group, group_id)

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    admin_result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.role == MemberRole.ADMIN,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if admin_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an admin of this group.",
        )

    target_result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == user_id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )
    target = target_result.scalar_one_or_none()

    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user is not an active member of this group.",
        )

    if (
        target.role == MemberRole.ADMIN
        and new_role != MemberRole.ADMIN
    ):
        admins_result = await db.execute(
            select(func.count())
            .select_from(GroupMembership)
            .where(
                GroupMembership.group_id == group_id,
                GroupMembership.role == MemberRole.ADMIN,
                GroupMembership.status == MembershipStatus.ACTIVE,
            )
        )

        if admins_result.scalar_one() <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot demote the last active admin.",
            )

    try:
        target.role = new_role
        await db.commit()

        return {
            "detail": "Membership role updated successfully."
        }

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update membership role.",
        ) from e


# --------------------------------------------------
# CREATE INVITATION CODE (ADMIN ONLY)
# Maximum 5 active codes per group; each expires in 5 minutes.
# --------------------------------------------------

@router.post(
    "/{group_id}/invitations",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_group_invitation(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Lock the group row to serialize invitation creation
    # for this group in PostgreSQL.
    group_result = await db.execute(
        select(Group)
        .where(Group.id == group_id)
        .with_for_update()
    )
    group = group_result.scalar_one_or_none()

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    membership_result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.role == MemberRole.ADMIN,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if membership_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active group admins can create invitation codes.",
        )

    now = datetime.now(timezone.utc)

    count_result = await db.execute(
        select(func.count())
        .select_from(Invitation)
        .where(
            Invitation.group_id == group_id,
            Invitation.used_at.is_(None),
            Invitation.revoked_at.is_(None),
            Invitation.expires_at > now,
        )
    )
    active_count = count_result.scalar_one()

    if active_count >= MAX_ACTIVE_INVITATIONS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This group already has the maximum of "
                f"{MAX_ACTIVE_INVITATIONS} active invitation codes."
            ),
        )

    # Generate a unique code. Only its hash is stored.
    for _ in range(5):
        code = generate_invitation_code()
        code_hash = hash_invitation_code(code)

        duplicate_result = await db.execute(
            select(Invitation.id).where(
                Invitation.code_hash == code_hash
            )
        )

        if duplicate_result.scalar_one_or_none() is None:
            break
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not generate an invitation code.",
        )

    invitation = Invitation(
        group_id=group_id,
        created_by=current_user.id,
        code_hash=code_hash,
        expires_at=now + timedelta(
            minutes=INVITATION_EXPIRY_MINUTES
        ),
    )

    try:
        db.add(invitation)
        await db.commit()
        await db.refresh(invitation)

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create invitation.",
        ) from e

    # The plaintext code is returned only once.
    return {
        "id": invitation.id,
        "group_id": invitation.group_id,
        "created_by": invitation.created_by,
        "code": code,
        "expires_at": invitation.expires_at,
        "used_at": invitation.used_at,
        "revoked_at": invitation.revoked_at,
        "created_at": invitation.created_at,
    }


# --------------------------------------------------
# JOIN GROUP USING INVITATION CODE
# --------------------------------------------------

@router.post("/{group_id}/join")
async def join_group(
    group_id: int,
    code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Lock the group first so joins and invitation creation
    # for the same group are serialized in PostgreSQL.
    group_result = await db.execute(
        select(Group)
        .where(Group.id == group_id)
        .with_for_update()
    )
    group = group_result.scalar_one_or_none()

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    normalized_code = code.strip().upper()

    if (
        not normalized_code
        or not all(
            char in INVITATION_ALPHABET
            for char in normalized_code
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid invitation code.",
        )

    invitation_result = await db.execute(
        select(Invitation)
        .where(
            Invitation.group_id == group_id,
            Invitation.code_hash
            == hash_invitation_code(normalized_code),
        )
        .with_for_update()
    )
    invitation = invitation_result.scalar_one_or_none()

    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invitation code for this group.",
        )

    now = datetime.now(timezone.utc)

    if invitation.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation has been revoked.",
        )

    if invitation.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation has already been used.",
        )

    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation has expired.",
        )

    membership_result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
        )
    )
    membership = membership_result.scalar_one_or_none()

    if (
        membership is not None
        and membership.status == MembershipStatus.ACTIVE
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already an active member of this group.",
        )

    try:
        if membership is None:
            membership = GroupMembership(
                group_id=group_id,
                user_id=current_user.id,
                role=MemberRole.MEMBER,
                status=MembershipStatus.ACTIVE,
            )
            db.add(membership)
        else:
            # Reactivate former members as ordinary members.
            membership.role = MemberRole.MEMBER
            membership.status = MembershipStatus.ACTIVE

        # Joining and consuming the code happen in one transaction.
        invitation.used_at = now

        await db.commit()

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not join the group.",
        ) from e

    return {
        "message": "Joined group successfully.",
        "group_id": group_id,
        "membership_status": "ACTIVE",
    }

import hashlib
import secrets
import string

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
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
from app.models.invitation import Invitation

from app.schemas.group import (
    Creategroup as GroupCreate,
    GroupResponse,
    GroupUpdate,
    MembershipRoleUpdateResponse,
)
from app.schemas.invitation import InvitationResponse


router = APIRouter(
    prefix="/api/v1/groups",
    tags=["Groups"],
)

MAX_ACTIVE_INVITATIONS = 5
INVITATION_EXPIRY_MINUTES = 5
INVITATION_CODE_LENGTH = 8
INVITATION_ALPHABET = string.ascii_uppercase + string.digits


def hash_invitation_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def generate_invitation_code() -> str:
    return "".join(
        secrets.choice(INVITATION_ALPHABET)
        for _ in range(INVITATION_CODE_LENGTH)
    )


# --------------------------------------------------
# CREATE GROUP
# --------------------------------------------------

@router.post(
    "/",
    response_model=GroupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_group(
    group_data: GroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_group = Group(
        name=group_data.name,
        group_type=GroupType(group_data.group_type),
        created_by=current_user.id,
    )

    try:
        db.add(new_group)
        await db.flush()

        new_membership = GroupMembership(
            group_id=new_group.id,
            user_id=current_user.id,
            role=MemberRole.ADMIN,
            status=MembershipStatus.ACTIVE,
        )
        db.add(new_membership)

        await db.commit()
        await db.refresh(new_group)

        return new_group

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create group.",
        ) from e


# --------------------------------------------------
# GET CURRENT USER'S GROUPS
# --------------------------------------------------

@router.get("/", response_model=list[GroupResponse])
async def get_user_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Group)
        .join(
            GroupMembership,
            GroupMembership.group_id == Group.id,
        )
        .where(
            GroupMembership.user_id == current_user.id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    result = await db.execute(query)
    return result.scalars().all()


# --------------------------------------------------
# GET GROUP DETAILS
# --------------------------------------------------

@router.get("/{group_id}", response_model=GroupResponse)
async def get_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(Group, group_id)

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this group.",
        )

    return group


# --------------------------------------------------
# UPDATE GROUP
# --------------------------------------------------

@router.patch("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: int,
    group_data: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(Group, group_id)

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.role == MemberRole.ADMIN,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an admin of this group.",
        )

    update_data = group_data.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided for update.",
        )

    if update_data.get("name", "not_provided") is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Group name cannot be null.",
        )

    for key, value in update_data.items():
        setattr(group, key, value)

    try:
        await db.commit()
        await db.refresh(group)
        return group

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update group.",
        ) from e


# --------------------------------------------------
# UNSUBSCRIBE FROM GROUP
# --------------------------------------------------

@router.delete(
    "/{group_id}/unsubscribe",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unsubscribe_from_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(Group, group_id)

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )
    membership = result.scalar_one_or_none()

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not an active member of this group.",
        )

    if membership.role == MemberRole.ADMIN:
        admins_result = await db.execute(
            select(func.count())
            .select_from(GroupMembership)
            .where(
                GroupMembership.group_id == group_id,
                GroupMembership.role == MemberRole.ADMIN,
                GroupMembership.status == MembershipStatus.ACTIVE,
            )
        )

        if admins_result.scalar_one() <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "You are the last active admin. "
                    "Assign another admin before leaving."
                ),
            )

    try:
        membership.status = MembershipStatus.LEFT
        await db.commit()

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to unsubscribe from group.",
        ) from e

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------
# UPDATE MEMBER ROLE
# --------------------------------------------------

@router.patch(
    "/{group_id}/membership/{user_id}/role",
    response_model=MembershipRoleUpdateResponse,
)
async def update_membership_role(
    group_id: int,
    user_id: int,
    new_role: MemberRole,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(Group, group_id)

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    admin_result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.role == MemberRole.ADMIN,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if admin_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an admin of this group.",
        )

    target_result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == user_id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )
    target = target_result.scalar_one_or_none()

    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user is not an active member of this group.",
        )

    if (
        target.role == MemberRole.ADMIN
        and new_role != MemberRole.ADMIN
    ):
        admins_result = await db.execute(
            select(func.count())
            .select_from(GroupMembership)
            .where(
                GroupMembership.group_id == group_id,
                GroupMembership.role == MemberRole.ADMIN,
                GroupMembership.status == MembershipStatus.ACTIVE,
            )
        )

        if admins_result.scalar_one() <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot demote the last active admin.",
            )

    try:
        target.role = new_role
        await db.commit()

        return {
            "detail": "Membership role updated successfully."
        }

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update membership role.",
        ) from e


# --------------------------------------------------
# CREATE INVITATION CODE (ADMIN ONLY)
# Maximum 5 active codes per group; each expires in 5 minutes.
# --------------------------------------------------

@router.post(
    "/{group_id}/invitations",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_group_invitation(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Lock the group row to serialize invitation creation
    # for this group in PostgreSQL.
    group_result = await db.execute(
        select(Group)
        .where(Group.id == group_id)
        .with_for_update()
    )
    group = group_result.scalar_one_or_none()

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    membership_result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.role == MemberRole.ADMIN,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if membership_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active group admins can create invitation codes.",
        )

    now = datetime.now(timezone.utc)

    count_result = await db.execute(
        select(func.count())
        .select_from(Invitation)
        .where(
            Invitation.group_id == group_id,
            Invitation.used_at.is_(None),
            Invitation.revoked_at.is_(None),
            Invitation.expires_at > now,
        )
    )
    active_count = count_result.scalar_one()

    if active_count >= MAX_ACTIVE_INVITATIONS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This group already has the maximum of "
                f"{MAX_ACTIVE_INVITATIONS} active invitation codes."
            ),
        )

    # Generate a unique code. Only its hash is stored.
    for _ in range(5):
        code = generate_invitation_code()
        code_hash = hash_invitation_code(code)

        duplicate_result = await db.execute(
            select(Invitation.id).where(
                Invitation.code_hash == code_hash
            )
        )

        if duplicate_result.scalar_one_or_none() is None:
            break
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not generate an invitation code.",
        )

    invitation = Invitation(
        group_id=group_id,
        created_by=current_user.id,
        code_hash=code_hash,
        expires_at=now + timedelta(
            minutes=INVITATION_EXPIRY_MINUTES
        ),
    )

    try:
        db.add(invitation)
        await db.commit()
        await db.refresh(invitation)

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create invitation.",
        ) from e

    # The plaintext code is returned only once.
    return {
        "id": invitation.id,
        "group_id": invitation.group_id,
        "created_by": invitation.created_by,
        "code": code,
        "expires_at": invitation.expires_at,
        "used_at": invitation.used_at,
        "revoked_at": invitation.revoked_at,
        "created_at": invitation.created_at,
    }


# --------------------------------------------------
# JOIN GROUP USING INVITATION CODE
# --------------------------------------------------

@router.post("/{group_id}/join")
async def join_group(
    group_id: int,
    code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Lock the group first so joins and invitation creation
    # for the same group are serialized in PostgreSQL.
    group_result = await db.execute(
        select(Group)
        .where(Group.id == group_id)
        .with_for_update()
    )
    group = group_result.scalar_one_or_none()

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    normalized_code = code.strip().upper()

    if (
        not normalized_code
        or not all(
            char in INVITATION_ALPHABET
            for char in normalized_code
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid invitation code.",
        )

    invitation_result = await db.execute(
        select(Invitation)
        .where(
            Invitation.group_id == group_id,
            Invitation.code_hash
            == hash_invitation_code(normalized_code),
        )
        .with_for_update()
    )
    invitation = invitation_result.scalar_one_or_none()

    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invitation code for this group.",
        )

    now = datetime.now(timezone.utc)

    if invitation.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation has been revoked.",
        )

    if invitation.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation has already been used.",
        )

    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation has expired.",
        )

    membership_result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
        )
    )
    membership = membership_result.scalar_one_or_none()

    if (
        membership is not None
        and membership.status == MembershipStatus.ACTIVE
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already an active member of this group.",
        )

    try:
        if membership is None:
            membership = GroupMembership(
                group_id=group_id,
                user_id=current_user.id,
                role=MemberRole.MEMBER,
                status=MembershipStatus.ACTIVE,
            )
            db.add(membership)
        else:
            # Reactivate former members as ordinary members.
            membership.role = MemberRole.MEMBER
            membership.status = MembershipStatus.ACTIVE

        # Joining and consuming the code happen in one transaction.
        invitation.used_at = now

        await db.commit()

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not join the group.",
        ) from e

    return {
        "message": "Joined group successfully.",
        "group_id": group_id,
        "membership_status": "ACTIVE",
    }


# --------------------------------------------------
# LIST ACTIVE MEMBERS OF A GROUP (ACTIVE MEMBERS ONLY)
# --------------------------------------------------

from app.schemas.auth import GroupMemberResponse  # noqa: E402


@router.get(
    "/{group_id}/members",
    response_model=list[GroupMemberResponse],
)
async def list_group_members(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(Group, group_id)

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    requester = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user.id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
    )

    if requester.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this group.",
        )

    result = await db.execute(
        select(GroupMembership, User)
        .join(User, User.id == GroupMembership.user_id)
        .where(
            GroupMembership.group_id == group_id,
            GroupMembership.status == MembershipStatus.ACTIVE,
        )
        .order_by(User.username)
    )

    return [
        {
            "user_id": user.id,
            "username": user.username,
            "role": membership.role.value,
            "is_active": user.is_active,
        }
        for membership, user in result.all()
    ]
