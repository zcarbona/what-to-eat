
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
    instructions: str = Field(min_length=3, max_length=500)


class MealResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    ingredients: list[str]
    instructions: str
    created_at: datetime


from pydantic import BaseModel, Field


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
        max_length=500,
    )
