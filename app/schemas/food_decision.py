from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


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


class DecisionRoundCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    scheduled_date: date | None = None
    assigned_user_id: int | None = None
    deadline_at: datetime | None = None
    closes_at: datetime | None = None


class FoodSubmissionCreate(BaseModel):
    food_name: str = Field(min_length=2, max_length=150)
    note: str | None = Field(default=None, max_length=300)


class FoodSubmissionResponse(BaseModel):
    id: int
    round_id: int
    user_id: int
    username: str
    food_name: str
    note: str | None
    created_at: datetime


class DecisionRoundResolve(BaseModel):
    mode: str = Field(default="random", pattern="^(random|pick|meal)$")
    submission_id: int | None = None
    selected_meal_id: int | None = None


class DecisionRoundResponse(BaseModel):
    id: int
    group_id: int
    title: str | None
    created_by: int | None
    scheduled_date: date | None
    assigned_user_id: int | None
    assigned_username: str | None = None
    selected_meal_id: int | None
    selected_meal_name: str | None = None
    deadline_at: datetime | None
    closes_at: datetime | None
    status: str
    decided_at: datetime | None
    created_at: datetime
    submissions: list[FoodSubmissionResponse] = Field(default_factory=list)
    winning_submission_id: int | None = None
    winning_food_name: str | None = None
    winning_username: str | None = None
