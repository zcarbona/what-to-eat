from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.gathering import MealType


class GatheringCreate(BaseModel):
    name: str = Field(min_length=3, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    gathering_time: datetime
    meal_type: MealType
    group_id: int


class GatheringUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    gathering_time: datetime | None = None
    meal_type: MealType | None = None


class GatheringResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    gathering_time: datetime
    meal_type: MealType
    group_id: int
    created_by: int
    created_at: datetime


class GatheringPreferenceCreate(BaseModel):
    allergies: list[str] = Field(default_factory=list, max_length=50)
    dietary_restrictions: list[str] = Field(default_factory=list, max_length=50)
    dislikes: list[str] = Field(default_factory=list, max_length=50)
    notes: str | None = Field(default=None, max_length=300)


class GatheringPreferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    user_id: int
    username: str | None = None
    allergies: list[str]
    dietary_restrictions: list[str]
    dislikes: list[str]
    notes: str | None = None
    created_at: datetime | None = None


class GatheringMenuItemCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category: str = Field(default="dish", max_length=50)
    assigned_user_id: int | None = None


class GatheringMenuItemResponse(BaseModel):
    id: int
    event_id: int
    name: str
    category: str
    assigned_user_id: int | None
    assigned_username: str | None = None
    created_by: int
    created_at: datetime
