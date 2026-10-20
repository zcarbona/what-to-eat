
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# Food decision schemas

class FoodDecisionCreate(BaseModel):
    name: str = Field(min_length=3, max_length=100)
    description: str | None = Field(
        default=None,
        max_length=500,
    )
    options: list[str] = Field(min_length=1)


class FoodDecisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    options: list[str]
    created_at: datetime
