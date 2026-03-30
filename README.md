# Expense Tracker SPA (React + FastAPI + MySQL)

This project is a single-page expense tracker that lets users create, view, update, filter, and delete spending records in real time. It solves the problem of personal expense monitoring by combining CRUD operations with category summaries, monthly trends, and filter-aware dashboard cards.

## Technical Stack
- Frontend: React 18 + Vite
- Styling: Custom CSS
- Backend/API: FastAPI
- Database: MySQL
- ORM / DB access: SQLAlchemy + PyMySQL

## Feature List
- Full CRUD for expense records
- Category and date-range filtering
- Filter-aware category totals
- Filter-aware monthly spending trend
- Dashboard cards for total spend, average spend, item count, and current month spending
- Single-page interactions without full page reloads
- Backend validation and frontend status/error feedback

## Folder Structure
```text
.
├── app
│   ├── __init__.py
│   ├── database.py
│   ├── main.py
│   ├── models.py
│   └── schemas.py
├── frontend
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js
│   └── src
│       ├── api.js
│       ├── App.jsx
│       ├── main.jsx
│       └── styles.css
├── exports
│   ├── expenses_sample.json
│   └── expenses_seed.json
├── scripts
│   └── generate_seed_data.py
├── .env.example
├── requirements.txt
└── README.md
```

## Prerequisites
Install these before running the project on a new machine:
- Node.js 20 LTS
- Python 3.11
- MySQL Server 8.x

Check the tools after installation:
```bash
node -v
npm -v
python3.11 --version
mysql --version
```

## Database Setup
Start MySQL first, then create the database and user used by the project.

Open a MySQL shell as root or another admin user:
```bash
mysql -u root -p
```

Run:
```sql
CREATE DATABASE IF NOT EXISTS expense_tracker;
CREATE USER IF NOT EXISTS 'expense_user'@'localhost' IDENTIFIED BY 'expense_password';
GRANT ALL PRIVILEGES ON expense_tracker.* TO 'expense_user'@'localhost';
FLUSH PRIVILEGES;
```

The default backend connection string is:
```text
mysql+pymysql://expense_user:expense_password@localhost:3306/expense_tracker
```

If your MySQL username, password, or port is different, update `DATABASE_URL` in `.env`.

## Quick Start
1. Backend setup:
   ```bash
   python3.11 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env
   uvicorn app.main:app --reload --env-file .env
   ```
2. Frontend setup in a new terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Note: during development, the Vite dev server proxies `/api/*` and `/health` to the FastAPI backend (see `frontend/vite.config.js`),
   so you do not need to set `VITE_API_BASE` for local dev.
3. Open:
   - Frontend: `http://127.0.0.1:5173`
   - API docs: `http://127.0.0.1:8000/docs`

## First-Run Checklist
- Confirm MySQL is installed and running
- Confirm the `expense_tracker` database exists
- Confirm `.env` contains a valid `DATABASE_URL`
- Start the FastAPI backend
- Start the React frontend
- Open the frontend in the browser

If the frontend opens but data does not load:
- Check that the backend is running on `http://127.0.0.1:8000`
- Check that MySQL is running on `localhost:3306`
- Check the backend terminal for a `503` or database connection error

## API Overview
- `GET /health`
- `POST /api/expenses`
- `GET /api/expenses`
- `GET /api/expenses/{id}`
- `PUT /api/expenses/{id}`
- `DELETE /api/expenses/{id}`
- `GET /api/analytics/category`
- `GET /api/analytics/monthly?months=6`

Analytics endpoints accept the same optional filter params as the expense list:
- `category`
- `start_date`
- `end_date`

## Sample Data
The project includes sample JSON exports in [`exports/expenses_sample.json`](./exports/expenses_sample.json) and [`exports/expenses_seed.json`](./exports/expenses_seed.json).

Generate a fresh JSON dataset:
```bash
python scripts/generate_seed_data.py --count 200 --months 8 --seed 32516 --out exports/expenses_seed.json
```

Generate and import directly into MySQL:
```bash
python scripts/generate_seed_data.py --count 200 --months 8 --seed 32516 --import-mysql --clear
```

After importing, you should see records in the UI and analytics endpoints:
- Frontend list shows many expenses (not an empty table)
- `GET /api/analytics/category` returns multiple categories with totals
- `GET /api/analytics/monthly?months=6` returns up to 6 recent months of totals

Tip: the seed importer uses `DATABASE_URL` from your environment by default, so it will import into the same database configured in `.env`.

## Source Package Submission
Submit this project as a source package rather than a full local runtime snapshot.

Include:
- `app/`
- `frontend/src/`
- `frontend/index.html`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/vite.config.js`
- `exports/`
- `scripts/`
- `.env.example`
- `requirements.txt`
- `README.md`

Do not include:
- `frontend/node_modules/`
- `frontend/dist/`
- `.venv/`
- `__pycache__/`
- `.idea/`
- `.DS_Store`

## Challenges Overcome
One challenge was keeping the single-page frontend synchronized while form state, table filters, analytics cards, and charts all update together. Another was restructuring the backend from a document database approach into a cleaner relational model that better fits expense records. The analytics logic was rewritten with SQLAlchemy queries so category totals and monthly trends match the same active filters as the table. The project also required clearer setup instructions so a marker can install dependencies, create the MySQL database, and run the app with minimal friction.

## Rubric Mapping
- SPA: the React app updates the current page without loading new HTML documents
- CRUD: all four operations are implemented against MySQL
- Business logic: practical expense logging plus summaries and trend analytics
- UX and presentation: responsive layout, clear feedback, and filter-aware dashboard components
- Readme: includes title, problem summary, stack, features, structure, setup, and challenges
- Code quality: separated frontend/backend modules, validation, and database error handling
