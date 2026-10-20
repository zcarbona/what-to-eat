
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class InvitationCreate(BaseModel):
    group_id: int


class InvitationResponse(BaseModel):
    id: int
    group_id: int
    created_by: int
    code: str
    expires_at: datetime
    used_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
