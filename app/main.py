import os
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine
from .models import Expense
from .schemas import (
    CategoryTotal,
    DeleteResponse,
    ExpenseCreate,
    ExpenseOut,
    ExpenseUpdate,
    MonthlyTotal,
)

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://127.0.0.1:5173,http://localhost:5173",
)


def split_origins(origins: str) -> list[str]:
    return [origin.strip() for origin in origins.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.database_error = None

    try:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as connection:
            connection.execute(select(1))
    except SQLAlchemyError as error:
        app.state.database_error = str(error)

    try:
        yield
    finally:
        engine.dispose()


app = FastAPI(title="Expense Tracker API", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=split_origins(CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db(request: Request):
    if request.app.state.database_error:
        raise HTTPException(
            status_code=503,
            detail=(
                "MySQL is not available. Start MySQL, confirm DATABASE_URL, and restart FastAPI. "
                f"Details: {request.app.state.database_error}"
            ),
        )

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]


def apply_expense_filters(
    statement,
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
):
    cleaned_category = (category or "").strip()
    if cleaned_category:
        statement = statement.where(Expense.category == cleaned_category)
    if start_date:
        statement = statement.where(Expense.expense_date >= start_date)
    if end_date:
        statement = statement.where(Expense.expense_date <= end_date)
    return statement


def serialize_expense(expense: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=str(expense.id),
        title=expense.title,
        category=expense.category,
        amount=float(expense.amount),
        expense_date=expense.expense_date,
        description=expense.description,
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


def get_expense_or_404(db: Session, expense_id: str) -> Expense:
    if not expense_id.isdigit():
        raise HTTPException(status_code=404, detail="Expense not found.")

    expense = db.get(Expense, int(expense_id))
    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found.")
    return expense


@app.get("/health")
def health(db: DbSession) -> dict[str, str]:
    db.execute(select(1))
    return {"status": "ok"}


@app.post("/api/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(payload: ExpenseCreate, db: DbSession):
    expense = Expense(
        title=payload.title,
        category=payload.category,
        amount=Decimal(str(payload.amount)),
        expense_date=payload.expense_date,
        description=payload.description,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return serialize_expense(expense)


@app.get("/api/expenses", response_model=list[ExpenseOut])
def list_expenses(
    db: DbSession,
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
):
    statement = select(Expense).order_by(Expense.expense_date.desc(), Expense.id.desc())
    statement = apply_expense_filters(
        statement, category=category, start_date=start_date, end_date=end_date
    )
    expenses = db.scalars(statement).all()
    return [serialize_expense(expense) for expense in expenses]


@app.get("/api/expenses/{expense_id}", response_model=ExpenseOut)
def get_expense(expense_id: str, db: DbSession):
    return serialize_expense(get_expense_or_404(db, expense_id))


@app.put("/api/expenses/{expense_id}", response_model=ExpenseOut)
def update_expense(expense_id: str, payload: ExpenseUpdate, db: DbSession):
    expense = get_expense_or_404(db, expense_id)
    expense.title = payload.title
    expense.category = payload.category
    expense.amount = Decimal(str(payload.amount))
    expense.expense_date = payload.expense_date
    expense.description = payload.description

    db.commit()
    db.refresh(expense)
    return serialize_expense(expense)


@app.delete("/api/expenses/{expense_id}", response_model=DeleteResponse)
def delete_expense(expense_id: str, db: DbSession):
    expense = get_expense_or_404(db, expense_id)
    db.delete(expense)
    db.commit()
    return {"message": "Expense deleted."}


@app.get("/api/analytics/category", response_model=list[CategoryTotal])
def category_totals(
    db: DbSession,
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
):
    statement = select(
        Expense.category,
        func.sum(Expense.amount).label("total"),
    ).group_by(Expense.category).order_by(func.sum(Expense.amount).desc(), Expense.category.asc())
    statement = apply_expense_filters(
        statement, category=category, start_date=start_date, end_date=end_date
    )
    rows = db.execute(statement).all()
    return [{"category": row.category, "total": float(row.total)} for row in rows]


@app.get("/api/analytics/monthly", response_model=list[MonthlyTotal])
def monthly_totals(
    db: DbSession,
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    months: int = Query(default=6, ge=1, le=24),
):
    month_key = func.date_format(Expense.expense_date, "%Y-%m")
    statement = select(
        month_key.label("month"),
        func.sum(Expense.amount).label("total"),
    ).group_by(month_key).order_by(month_key.asc())
    statement = apply_expense_filters(
        statement, category=category, start_date=start_date, end_date=end_date
    )
    rows = db.execute(statement).all()
    trimmed = rows[-months:]
    return [{"month": row.month, "total": float(row.total)} for row in trimmed]


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {
        "message": (
            "Expense Tracker API is running. Start the React frontend with "
            "`npm run dev` inside the `frontend` folder."
        )
    }
