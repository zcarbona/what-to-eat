from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# Food meal schemas

class MealCreate(BaseModel):
    name: str = Field(min_length=3, max_length=100)
    description: str | None = Field(
        default=None,
        max_length=500,
    )
    ingredients: list[str] = Field(min_length=1)
    instructions: str = Field(min_length=3, max_length=1000)


class MealResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    group_id: int
    name: str
    description: str | None
    ingredients: list[str]
    instructions: str
    is_active: bool = True
    created_at: datetime


class FamilyMealUpdate(BaseModel):
    name: str | None = Field(
        default=None,
        min_length=3,
        max_length=100,
    )

    description: str | None = Field(
        default=None,
        max_length=500,
    )

    ingredients: list[str] | None = Field(
        default=None,
        min_length=1,
    )

    instructions: str | None = Field(
        default=None,
        min_length=3,
        max_length=1000,
    )

    is_active: bool | None = None


class ShoppingResponsibilityCreate(BaseModel):
    assigned_user_id: int
    meal_id: int
    due_at: datetime | None = None


class ShoppingResponsibilityResponse(BaseModel):
    id: int
    group_id: int
    assigned_user_id: int
    assigned_username: str
    meal_id: int
    meal_name: str
    ingredients: list[str]
    status: str
    due_at: datetime | None
    created_at: datetime


class ResponsibilityReportCreate(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
