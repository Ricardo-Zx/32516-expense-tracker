#!/usr/bin/env python3
"""Generate reproducible semi-synthetic expense records.

Usage examples:
  python scripts/generate_seed_data.py
  python scripts/generate_seed_data.py --count 240 --months 12 --seed 32516
  python scripts/generate_seed_data.py --import-mysql --clear
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
from dataclasses import dataclass
from decimal import Decimal
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

DEFAULT_OUT = Path("exports/expenses_seed.json")


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@dataclass(frozen=True)
class CategoryConfig:
    name: str
    weight: int
    min_amount: float
    max_amount: float
    titles: tuple[str, ...]
    notes: tuple[str, ...]


CATEGORIES: tuple[CategoryConfig, ...] = (
    CategoryConfig(
        name="Food",
        weight=28,
        min_amount=8.0,
        max_amount=48.0,
        titles=(
            "Lunch",
            "Dinner",
            "Cafe Coffee",
            "Takeaway Meal",
            "Bakery Snacks",
        ),
        notes=(
            "Campus meal",
            "Quick dinner near station",
            "Coffee before class",
            "Weekend brunch",
            "Meal with friends",
        ),
    ),
    CategoryConfig(
        name="Groceries",
        weight=18,
        min_amount=22.0,
        max_amount=145.0,
        titles=(
            "Supermarket Run",
            "Fresh Produce",
            "Household Essentials",
            "Weekly Grocery Shopping",
        ),
        notes=(
            "Weekly grocery stock-up",
            "Bought fruits and vegetables",
            "Rice, milk and pantry items",
            "Cleaning and household supplies",
        ),
    ),
    CategoryConfig(
        name="Transport",
        weight=16,
        min_amount=3.0,
        max_amount=65.0,
        titles=(
            "Bus Opal Top-up",
            "Train Fare",
            "Ride Share",
            "Fuel",
            "Parking",
        ),
        notes=(
            "Daily commute",
            "Trip to campus",
            "Late-night ride home",
            "Weekend travel",
            "City parking fee",
        ),
    ),
    CategoryConfig(
        name="Utilities",
        weight=10,
        min_amount=45.0,
        max_amount=220.0,
        titles=(
            "Electricity Bill",
            "Internet Bill",
            "Water Bill",
            "Mobile Plan",
        ),
        notes=(
            "Shared apartment utility",
            "Monthly service charge",
            "Essential home bill",
            "Auto-payment",
        ),
    ),
    CategoryConfig(
        name="Rent",
        weight=8,
        min_amount=260.0,
        max_amount=620.0,
        titles=(
            "Weekly Rent",
            "Rent Adjustment",
            "Shared Apartment Rent",
        ),
        notes=(
            "Weekly room rent",
            "Bond-related adjustment",
            "Transfer to landlord",
        ),
    ),
    CategoryConfig(
        name="Entertainment",
        weight=9,
        min_amount=9.0,
        max_amount=120.0,
        titles=(
            "Movie Ticket",
            "Streaming Subscription",
            "Concert Ticket",
            "Game Purchase",
        ),
        notes=(
            "Weekend activity",
            "Monthly subscription fee",
            "Social event with friends",
            "Relaxation spending",
        ),
    ),
    CategoryConfig(
        name="Education",
        weight=6,
        min_amount=14.0,
        max_amount=260.0,
        titles=(
            "Textbook",
            "Stationery",
            "Online Course",
            "Lab Material",
        ),
        notes=(
            "Subject learning material",
            "Study supplies",
            "Skill improvement purchase",
            "Semester preparation",
        ),
    ),
    CategoryConfig(
        name="Healthcare",
        weight=5,
        min_amount=12.0,
        max_amount=180.0,
        titles=(
            "Pharmacy",
            "Clinic Visit",
            "Vitamins",
            "Dental Check",
        ),
        notes=(
            "Routine health purchase",
            "Basic consultation",
            "Medication refill",
            "Preventive care",
        ),
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate semi-synthetic expense data.")
    parser.add_argument("--count", type=int, default=180, help="Number of expense records.")
    parser.add_argument(
        "--months",
        type=int,
        default=8,
        help="How many recent months to cover.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=32516,
        help="Random seed for reproducibility.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"Output JSON path (default: {DEFAULT_OUT}).",
    )
    parser.add_argument(
        "--import-mysql",
        action="store_true",
        help="Insert generated records into MySQL.",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Delete existing rows before importing (with --import-mysql).",
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv(
            "DATABASE_URL",
            "mysql+pymysql://expense_user:expense_password@localhost:3306/expense_tracker",
        ),
        help="SQLAlchemy MySQL connection URL.",
    )
    args = parser.parse_args()

    if args.count <= 0:
        raise ValueError("--count must be > 0.")
    if args.months <= 0:
        raise ValueError("--months must be > 0.")
    return args


def weighted_category(rng: random.Random) -> CategoryConfig:
    return rng.choices(CATEGORIES, weights=[c.weight for c in CATEGORIES], k=1)[0]


def month_start(value: date) -> date:
    return date(year=value.year, month=value.month, day=1)


def shift_months(base: date, months: int) -> date:
    year = base.year + (base.month - 1 + months) // 12
    month = (base.month - 1 + months) % 12 + 1
    return date(year=year, month=month, day=1)


def random_date_in_window(rng: random.Random, months: int) -> date:
    today = date.today()
    start_month = shift_months(month_start(today), -(months - 1))
    span_days = (today - start_month).days
    offset = rng.randint(0, span_days)
    return start_month + timedelta(days=offset)


def trend_multiplier(expense_day: date) -> float:
    """Apply a mild upward trend for more recent months."""
    today = date.today()
    month_distance = (today.year - expense_day.year) * 12 + (today.month - expense_day.month)
    # Recent months slightly higher than older months.
    return max(0.84, 1.06 - (month_distance * 0.017))


def pick_amount(rng: random.Random, config: CategoryConfig, expense_day: date) -> float:
    center = config.min_amount + (config.max_amount - config.min_amount) * 0.38
    amount = rng.triangular(config.min_amount, config.max_amount, center)
    amount *= trend_multiplier(expense_day)

    # Small probability of unusually expensive events.
    if rng.random() < 0.06:
        amount *= rng.uniform(1.7, 3.1)

    return round(amount, 2)


def maybe_note(rng: random.Random, notes: tuple[str, ...]) -> str | None:
    # Keep some descriptions blank to look realistic.
    if rng.random() < 0.32:
        return None
    return rng.choice(notes)


def generate_record(rng: random.Random, months: int) -> dict[str, Any]:
    config = weighted_category(rng)
    expense_day = random_date_in_window(rng, months)

    return {
        "title": rng.choice(config.titles),
        "category": config.name,
        "amount": pick_amount(rng, config, expense_day),
        "expense_date": expense_day.isoformat(),
        "description": maybe_note(rng, config.notes),
    }


def generate_records(count: int, months: int, seed: int) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    records = [generate_record(rng, months) for _ in range(count)]
    records.sort(key=lambda item: item["expense_date"], reverse=True)
    return records


def write_json(path: Path, data: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)


def import_into_mysql(
    records: list[dict[str, Any]],
    database_url: str,
    clear: bool,
) -> int:
    try:
        from sqlalchemy import create_engine, delete
        from sqlalchemy.orm import Session
    except ImportError as error:
        raise RuntimeError("sqlalchemy and pymysql are required for --import-mysql.") from error

    from app.database import Base
    from app.models import Expense

    engine = create_engine(database_url, pool_pre_ping=True)
    Base.metadata.create_all(bind=engine)

    with Session(engine) as session:
        if clear:
            session.execute(delete(Expense))

        now = datetime.utcnow()
        docs = [
            Expense(
                title=item["title"],
                category=item["category"],
                amount=Decimal(str(item["amount"])),
                expense_date=date.fromisoformat(item["expense_date"]),
                description=item["description"],
                created_at=now,
                updated_at=now,
            )
            for item in records
        ]
        session.add_all(docs)
        session.commit()

    engine.dispose()
    return len(records)


def main() -> None:
    args = parse_args()
    records = generate_records(count=args.count, months=args.months, seed=args.seed)
    write_json(args.out, records)

    print(
        f"Generated {len(records)} records "
        f"(seed={args.seed}, months={args.months}) -> {args.out}"
    )

    if args.import_mysql:
        inserted = import_into_mysql(
            records=records,
            database_url=args.database_url,
            clear=args.clear,
        )
        print(
            "Imported to MySQL "
            f"(rows inserted={inserted}, clear={args.clear})"
        )


if __name__ == "__main__":
    main()
