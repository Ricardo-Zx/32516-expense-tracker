from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class ExpenseBase(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=60)
    amount: float = Field(gt=0)
    expense_date: date
    description: str | None = Field(default=None, max_length=500)

    @field_validator("title", "category")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be blank.")
        return cleaned

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(ExpenseBase):
    pass


class ExpenseOut(ExpenseBase):
    id: str
    created_at: datetime
    updated_at: datetime


class DeleteResponse(BaseModel):
    message: str


class CategoryTotal(BaseModel):
    category: str
    total: float


class MonthlyTotal(BaseModel):
    month: str
    total: float
