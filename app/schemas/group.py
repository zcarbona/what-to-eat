
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.group import GroupType


# Group schemas

class Creategroup(BaseModel):
    name: str = Field(min_length=3, max_length=100)
    group_type: GroupType


class GroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    # GroupType is a plain Enum; pydantic will not coerce it into `str`.
    # Serialises to the same JSON value ("family" / "friends" / "gathering").
    group_type: GroupType
    created_by: int
    created_at: datetime


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=100)
    group_type: GroupType | None = Field(default=None)

class MembershipRoleUpdateResponse(BaseModel):
    detail: str